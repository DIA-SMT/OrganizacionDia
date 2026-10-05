import type { NextConfig } from 'next'

// Portadas de los Migues agregados desde el dashboard: viven en el bucket migue-assets de Supabase.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'tesseract.js'],
  ...(supabaseUrl ? { images: { remotePatterns: [new URL(`${supabaseUrl}/storage/v1/object/public/migue-assets/**`)] } } : {}),
}

export default nextConfig
