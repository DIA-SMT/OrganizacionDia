import type { Metadata } from 'next'
import { ProjectReportScreen } from '@/components/project-report-screen'

// El titulo es el nombre que el navegador propone al guardar el PDF; la pantalla le suma la fecha.
export const metadata: Metadata = { title: 'Informe de proyectos DIA' }

export default function InformePage() {
  return <ProjectReportScreen />
}
