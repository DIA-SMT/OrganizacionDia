import { createSign } from 'node:crypto'

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  token_type?: string
  error?: string
  error_description?: string
}

export type DrivePdfFile = {
  id: string
  name: string
  mimeType: string
  createdTime: string
  modifiedTime: string
  webViewLink: string
  size?: string
}

const tokenUrl = 'https://oauth2.googleapis.com/token'
const driveFilesUrl = 'https://www.googleapis.com/drive/v3/files'
const driveScope = 'https://www.googleapis.com/auth/drive.readonly'

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function getPrivateKey() {
  return process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
}

export function getDriveConfig() {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const privateKey = getPrivateKey()
  const folderId = process.env.GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID

  return {
    configured: Boolean(clientEmail && privateKey && folderId),
    clientEmail,
    privateKey,
    folderId,
  }
}

async function getAccessToken() {
  const { clientEmail, privateKey } = getDriveConfig()
  if (!clientEmail || !privateKey) throw new Error('Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.')

  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claimSet = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: driveScope,
      aud: tokenUrl,
      exp: now + 3600,
      iat: now,
    }),
  )
  const unsignedToken = `${header}.${claimSet}`
  const signature = createSign('RSA-SHA256').update(unsignedToken).sign(privateKey)
  const assertion = `${unsignedToken}.${base64Url(signature)}`

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  })
  const payload = (await response.json()) as GoogleTokenResponse

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || 'No se pudo autenticar con Google Drive.')
  }

  return payload.access_token
}

export async function listExpedientePdfs() {
  const { folderId } = getDriveConfig()
  if (!folderId) throw new Error('Falta GOOGLE_DRIVE_EXPEDIENTES_FOLDER_ID.')

  const accessToken = await getAccessToken()
  const query = `'${folderId}' in parents and mimeType = 'application/pdf' and trashed = false`
  const params = new URLSearchParams({
    q: query,
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size)',
    orderBy: 'createdTime desc',
    pageSize: '100',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
  })

  const response = await fetch(`${driveFilesUrl}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No se pudo leer la carpeta de Drive. ${text}`)
  }

  const payload = (await response.json()) as { files?: DrivePdfFile[] }
  return payload.files ?? []
}

export async function downloadDriveFile(fileId: string) {
  const accessToken = await getAccessToken()
  const response = await fetch(`${driveFilesUrl}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`No se pudo descargar el PDF desde Drive. ${text}`)
  }

  return Buffer.from(await response.arrayBuffer())
}
