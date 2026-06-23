import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'tesseract.js'],
}

export default nextConfig
