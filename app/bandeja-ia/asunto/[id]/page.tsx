import { BandejaAsuntoScreen } from '@/components/bandeja-ia/bandeja-asunto-screen'

export default async function BandejaIaAsuntoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BandejaAsuntoScreen id={id} />
}
