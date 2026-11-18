import type { NextConfig } from 'next'

// Portadas de los Migues agregados desde el dashboard: viven en el bucket migue-assets de Supabase.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '')

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'tesseract.js'],
  images: {
    // Las imagenes ya se guardan livianas (WebP chicos), asi que se sirven tal cual desde la CDN.
    // El optimizador de Vercel (/_next/image) tiene cuota: al agotarse responde 402 y las imagenes no cargan.
    unoptimized: true,
    ...(supabaseUrl ? { remotePatterns: [new URL(`${supabaseUrl}/storage/v1/object/public/migue-assets/**`)] } : {}),
  },
}

export default nextConfig
