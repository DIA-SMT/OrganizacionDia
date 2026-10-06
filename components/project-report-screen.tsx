'use client'

import { useAuth } from '@/context/AuthContext'
import {
  REPORT_STATUSES,
  buildProjectReport,
  formatLongDate,
  formatMonthYear,
  formatReportDate,
  localIsoDate,
  paginateBlocks,
  plural,
  type ProjectReport,
  type ReportInput,
  type ReportProject,
  type ReportStatus,
} from '@/lib/project-report'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { ArrowLeft, Download, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'

// Medidas de la hoja en mm (plantilla institucional SMT / DIA). El contenido de la portada
// arranca debajo de la franja de 53 mm; el de las demas, debajo de la banda de 20 mm. Se deja
// aire antes del pie de 15 mm para que nada quede tapado.
const PAGE_HEIGHT = 297
const FOOT_HEIGHT = 15
const FOOT_GAP = 5
const FIRST_PAGE_CAPACITY = PAGE_HEIGHT - FOOT_HEIGHT - FOOT_GAP - 53 - 8
const PAGE_CAPACITY = PAGE_HEIGHT - FOOT_HEIGHT - FOOT_GAP - 20 - 7
const PX_PER_MM = 96 / 25.4
const COMMITS_PAGE = 1000

const STATUS_CLASS: Record<ReportStatus, string> = { 'En Producción': 'st-prod', QA: 'st-qa', 'En desarrollo': 'st-dev' }
const STATUS_LABEL: Record<ReportStatus, string> = { 'En Producción': 'En producción', QA: 'En pruebas (QA)', 'En desarrollo': 'En desarrollo' }
const STATUS_INTRO: Record<ReportStatus, string> = {
  'En Producción': 'Sistemas terminados y publicados, en uso por las áreas o por la ciudadanía.',
  QA: 'Sistemas completos que están en etapa de pruebas antes de su puesta en marcha.',
  'En desarrollo': 'Sistemas en construcción. Se ordenan por prioridad y luego por nombre.',
}

type Block = { key: string; band: string; keepWithNext?: boolean; spaced?: boolean; node: ReactNode }

async function loadReportInput(): Promise<{ input: ReportInput; warnings: string[] }> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) throw new Error('Supabase no esta configurado.')

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, name, description, requester_area, website_url, production_url, note, status, priority, progress, estimated_delivery')
    .eq('active', true)
    .in('status', [...REPORT_STATUSES])
  if (projectsError) throw new Error(`No se pudieron leer los proyectos: ${projectsError.message}`)

  const ids = ((projects ?? []) as Array<{ id: string }>).map((project) => project.id)
  const warnings: string[] = []
  if (ids.length === 0) return { input: { projects: [], members: [], projectMembers: [], tasks: [], blockers: [], commits: [] }, warnings }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [members, projectMembers, tasks, blockers] = await Promise.all([
    supabase.from('members').select('id, full_name'),
    supabase.from('project_members').select('project_id, member_id').in('project_id', ids),
    supabase.from('tasks').select('id, project_id, status').eq('active', true).in('project_id', ids),
    supabase.from('blockers').select('task_id, reason').eq('status', 'Abierto'),
  ])

  // Los commits pueden pasar el limite de filas por consulta: se piden por paginas.
  const commits: ReportInput['commits'] = []
  for (let from = 0; from < COMMITS_PAGE * 20; from += COMMITS_PAGE) {
    const { data, error } = await supabase
      .from('project_commits')
      .select('project_id, committed_at, author')
      .in('project_id', ids)
      .gte('committed_at', since)
      .order('committed_at', { ascending: false })
      .range(from, from + COMMITS_PAGE - 1)
    if (error) {
      warnings.push('No se pudo leer la actividad de commits; el informe sale sin esos datos.')
      break
    }
    commits.push(...((data ?? []) as ReportInput['commits']))
    if (!data || data.length < COMMITS_PAGE) break
  }

  if (members.error || projectMembers.error) warnings.push('No se pudieron leer los responsables de los proyectos.')
  if (tasks.error || blockers.error) warnings.push('No se pudieron leer las tareas o los bloqueos.')

  return {
    input: {
      projects: (projects ?? []) as ReportInput['projects'],
      members: (members.data ?? []) as ReportInput['members'],
      projectMembers: (projectMembers.data ?? []) as ReportInput['projectMembers'],
      tasks: (tasks.data ?? []) as ReportInput['tasks'],
      blockers: (blockers.data ?? []) as ReportInput['blockers'],
      commits,
    },
    warnings,
  }
}

function displayUrl(url: string) {
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`
}

function summaryParagraph(report: ProjectReport) {
  const { totals } = report
  const prod = totals.byStatus['En Producción']
  const qa = totals.byStatus.QA
  const dev = totals.byStatus['En desarrollo']
  const parts = [
    prod > 0 && <b key="p">{prod === 1 ? '1 ya está en producción' : `${prod} ya están en producción`}</b>,
    qa > 0 && <b key="q">{qa === 1 ? '1 está en etapa de pruebas' : `${qa} están en etapa de pruebas`}</b>,
    dev > 0 && <b key="d">{dev === 1 ? '1 está en desarrollo' : `${dev} están en desarrollo`}</b>,
  ].filter(Boolean) as ReactNode[]

  return (
    <p className="intro">
      Este informe reúne los <b>{plural(totals.projects, 'proyecto', 'proyectos')}</b> de la Dirección de Inteligencia Artificial que hoy
      están en desarrollo, en pruebas o en producción. De ellos,{' '}
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 && (index === parts.length - 1 ? ' y ' : ', ')}
          {part}
        </Fragment>
      ))}
      .{' '}
      {totals.commits > 0 ? (
        <>
          En los últimos 30 días se registraron <b>{plural(totals.commits, 'cambio de código', 'cambios de código')}</b> en{' '}
          {plural(totals.activeProjects, 'proyecto', 'proyectos')}
          {totals.contributors > 0 && <>, con aportes de {plural(totals.contributors, 'persona', 'personas')}</>}.
        </>
      ) : (
        <>En los últimos 30 días no se registraron cambios de código en estos proyectos.</>
      )}{' '}
      {report.overdue.length > 0 && (
        <>
          Hay <b>{report.overdue.length === 1 ? '1 entrega con la fecha estimada vencida' : `${report.overdue.length} entregas con la fecha estimada vencida`}</b>, que
          conviene revisar.
        </>
      )}
    </p>
  )
}

function ProjectCard({ project }: { project: ReportProject }) {
  const delivery = formatReportDate(project.delivery)
  // Es de los ultimos 30 dias: el anio sobra salvo en el cambio de anio.
  const lastCommit = formatReportDate(project.lastCommitAt)?.replace(` ${new Date().getFullYear()}`, '')
  const priorityClass = project.priority === 'Critica' || project.priority === 'Alta' ? 'pr-high' : project.priority === 'Baja' ? 'pr-low' : 'pr-mid'

  return (
    <div className={`pcard ${STATUS_CLASS[project.status]}`}>
      <div className="pc-head">
        <div className="pc-title">
          <h4>{project.name}</h4>
          <div className="pc-meta">
            <span className={`pill ${priorityClass}`}>Prioridad {project.priority === 'Critica' ? 'crítica' : project.priority.toLowerCase()}</span>
            <span>{project.area ? `Área solicitante: ${project.area}` : 'Área solicitante sin cargar'}</span>
          </div>
        </div>
        <div className="pc-progress">
          <span>
            <b>{project.progress}%</b> de avance
          </span>
          <div className="bar">
            <i style={{ width: `${project.progress}%` }} />
          </div>
        </div>
      </div>

      {project.description ? <p className="pc-desc">{project.description}</p> : <p className="pc-desc empty">Sin descripción cargada en el sistema.</p>}

      <div className="pc-facts">
        <div>
          <b>Entrega estimada</b>
          {delivery ? (
            <span>
              {delivery}
              {project.deliveryState === 'vencida' && <em className="flag late">vencida</em>}
              {project.deliveryState === 'proxima' && <em className="flag soon">próxima</em>}
            </span>
          ) : (
            <span className="muted">{project.status === 'En Producción' ? 'Entregado' : 'Sin fecha'}</span>
          )}
        </div>
        <div>
          <b>Actividad (30 días)</b>
          {project.commits > 0 ? (
            <span>
              {plural(project.commits, 'cambio', 'cambios')}
              {lastCommit && <> · último el {lastCommit}</>}
            </span>
          ) : (
            <span className="muted">Sin cambios registrados</span>
          )}
        </div>
        <div>
          <b>Equipo</b>
          {project.team.length > 0 ? <span>{joinNames(project.team)}</span> : <span className="muted">Sin responsables asignados</span>}
        </div>
        <div>
          <b>Sitio publicado</b>
          {project.site ? (
            <a href={project.site} target="_blank" rel="noreferrer">
              {displayUrl(project.site)}
            </a>
          ) : (
            <span className="muted">No informado</span>
          )}
        </div>
      </div>

      {(project.tasksOpen > 0 || project.tasksDone > 0 || project.openBlockers.length > 0) && (
        <p className="pc-line">
          <b>Tareas:</b> {plural(project.tasksOpen, 'abierta', 'abiertas')} · {plural(project.tasksDone, 'terminada', 'terminadas')}
          {project.openBlockers.length > 0 && (
            <>
              {' '}
              · <span className="late-text">Bloqueos: {project.openBlockers.join('; ')}</span>
            </>
          )}
        </p>
      )}
      {project.note && (
        <p className="pc-line">
          <b>Nota:</b> {project.note}
        </p>
      )}
    </div>
  )
}

function DeliveryList({ projects, empty }: { projects: ReportProject[]; empty: string }) {
  if (projects.length === 0) return <p className="list-empty">{empty}</p>
  return (
    <ul className="mini">
      {projects.map((project) => (
        <li key={project.id}>
          <b>{project.name}</b> · {formatReportDate(project.delivery)}
        </li>
      ))}
    </ul>
  )
}

function buildBlocks(report: ProjectReport, generatedAt: Date): Block[] {
  const { totals } = report
  const cover = 'Resumen general'
  const blocks: Block[] = []
  const heading = (key: string, band: string, title: string, spaced = true) =>
    blocks.push({ key, band, keepWithNext: true, spaced, node: <h2 className="sec">{title}</h2> })

  heading('h-resumen', cover, 'Resumen', false)
  blocks.push({ key: 'resumen', band: cover, node: summaryParagraph(report) })
  blocks.push({
    key: 'kpis',
    band: cover,
    spaced: true,
    node: (
      <div className="kpis kpis-4">
        <div className="kpi big">
          <b>{totals.projects}</b>
          <span>proyectos activos en el informe</span>
        </div>
        <div className="kpi big k-prod">
          <b>{totals.byStatus['En Producción']}</b>
          <span>en producción</span>
        </div>
        <div className="kpi big k-qa">
          <b>{totals.byStatus.QA}</b>
          <span>en pruebas (QA)</span>
        </div>
        <div className="kpi big k-dev">
          <b>{totals.byStatus['En desarrollo']}</b>
          <span>en desarrollo</span>
        </div>
        <div className="kpi">
          <b>{totals.averageProgress}%</b>
          <span>avance promedio informado</span>
        </div>
        <div className="kpi">
          <b>{totals.commits}</b>
          <span>cambios de código en 30 días</span>
        </div>
        <div className="kpi">
          <b>{totals.activeProjects}</b>
          <span>proyectos con actividad en 30 días</span>
        </div>
        <div className="kpi">
          <b>{report.overdue.length}</b>
          <span>entregas con fecha vencida</span>
        </div>
      </div>
    ),
  })

  heading('h-estado', cover, 'Estado de la cartera')
  blocks.push({
    key: 'estado',
    band: cover,
    node: (
      <div className="dist">
        <div className="dist-bar">
          {REPORT_STATUSES.map((status) =>
            totals.byStatus[status] > 0 ? <i key={status} className={STATUS_CLASS[status]} style={{ flexGrow: totals.byStatus[status] }} /> : null,
          )}
        </div>
        <div className="dist-legend">
          {REPORT_STATUSES.map((status) => (
            <span key={status}>
              <i className={STATUS_CLASS[status]} />
              {STATUS_LABEL[status]}: <b>{totals.byStatus[status]}</b>
              {totals.projects > 0 && <> ({Math.round((totals.byStatus[status] / totals.projects) * 100)}%)</>}
            </span>
          ))}
        </div>
      </div>
    ),
  })

  heading('h-entregas', cover, 'Entregas a seguir')
  blocks.push({
    key: 'entregas',
    band: cover,
    node: (
      <div className="two-col">
        <div className="panel panel-late">
          <h5>Con fecha estimada vencida</h5>
          <DeliveryList projects={report.overdue} empty="No hay entregas vencidas." />
        </div>
        <div className="panel">
          <h5>Previstas para los próximos 30 días</h5>
          <DeliveryList projects={report.upcoming} empty="No hay entregas previstas para el próximo mes." />
        </div>
      </div>
    ),
  })

  if (report.mostActive.length > 0) {
    const max = report.mostActive[0].commits
    heading('h-actividad', cover, 'Mayor actividad en los últimos 30 días')
    blocks.push({
      key: 'actividad',
      band: cover,
      node: (
        <div className="rank">
          {report.mostActive.map((project) => (
            <div key={project.id} className="rank-row">
              <span className="rank-name">{project.name}</span>
              <span className="rank-bar">
                <i style={{ width: `${Math.max(4, (project.commits / max) * 100)}%` }} />
              </span>
              <span className="rank-value">{plural(project.commits, 'cambio', 'cambios')}</span>
            </div>
          ))}
        </div>
      ),
    })
  }

  for (const section of report.sections) {
    heading(`h-${section.status}`, section.title, `${section.title} · ${section.projects.length}`)
    blocks.push({ key: `i-${section.status}`, band: section.title, node: <p className="sec-intro">{STATUS_INTRO[section.status]}</p> })
    for (const project of section.projects) {
      blocks.push({ key: project.id, band: section.title, spaced: true, node: <ProjectCard project={project} /> })
    }
  }

  const follow = 'Seguimiento'
  if (report.inactive.length > 0) {
    heading('h-inactivos', follow, 'Proyectos sin cambios registrados en 30 días')
    blocks.push({
      key: 'inactivos',
      band: follow,
      node: (
        <>
          <p className="sec-intro">
            Están en desarrollo o en pruebas, pero no registraron cambios de código en el último mes. Puede tratarse de proyectos en espera de una
            definición o de repositorios que todavía no están vinculados.
          </p>
          <div className="chips">
            {report.inactive.map((project) => (
              <span key={project.id}>{project.name}</span>
            ))}
          </div>
        </>
      ),
    })
  }

  const { missing } = report
  if (missing.description + missing.area + missing.delivery + missing.team > 0) {
    heading('h-datos', follow, 'Información a completar')
    blocks.push({
      key: 'datos',
      band: follow,
      node: (
        <>
          <p className="sec-intro">Cantidad de proyectos del informe a los que les falta cada dato en el sistema. Completarlos mejora el próximo informe.</p>
          <div className="reglas">
            <div>
              <b>{missing.description}</b>
              <span>sin descripción</span>
            </div>
            <div>
              <b>{missing.area}</b>
              <span>sin área solicitante</span>
            </div>
            <div>
              <b>{missing.delivery}</b>
              <span>sin fecha de entrega</span>
            </div>
            <div>
              <b>{missing.team}</b>
              <span>sin responsables</span>
            </div>
          </div>
        </>
      ),
    })
  }

  blocks.push({
    key: 'cierre',
    band: follow,
    spaced: true,
    node: (
      <>
        <div className="cierre">
          <b>En síntesis</b>
          <p>
            La cartera activa de la Dirección suma {plural(totals.projects, 'proyecto', 'proyectos')}: {totals.byStatus['En Producción']} en
            producción, {totals.byStatus.QA} en pruebas y {totals.byStatus['En desarrollo']} en desarrollo.{' '}
            {totals.commits > 0
              ? `El trabajo sigue en marcha, con ${plural(totals.commits, 'cambio de código', 'cambios de código')} en el último mes.`
              : 'No hubo cambios de código registrados en el último mes.'}{' '}
            {report.overdue.length > 0
              ? `Las prioridades inmediatas son reprogramar o cerrar ${report.overdue.length === 1 ? 'la entrega vencida' : `las ${report.overdue.length} entregas vencidas`} y completar los datos que faltan.`
              : 'No hay entregas vencidas a la fecha del informe.'}
          </p>
        </div>
        <p className="cap">
          Informe generado automáticamente desde el sistema de organización de la Dirección de Inteligencia Artificial el {formatLongDate(generatedAt)} a
          las {String(generatedAt.getHours()).padStart(2, '0')}:{String(generatedAt.getMinutes()).padStart(2, '0')} h, con los datos cargados a ese momento.
        </p>
      </>
    ),
  })

  return blocks
}

function PageFoot({ index, total, month }: { index: number; total: number; month: string }) {
  // Alterna como la plantilla: isologo municipal con atribucion a la DIA, y al reves.
  const pageLabel = `${month} · Página ${index + 1} de ${total}`
  if (index % 2 === 0) {
    return (
      <div className="foot">
        <div className="foot-l">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/informe/logo-muni-iso.png" alt="" />
          <div>
            <b>Municipalidad de San Miguel de Tucumán</b>Informe de proyectos
          </div>
        </div>
        <div className="foot-r">
          Elaborado por la Dirección de Inteligencia Artificial
          <br />
          {pageLabel}
        </div>
      </div>
    )
  }
  return (
    <div className="foot">
      <div className="foot-l">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/informe/logo-ia.png" alt="" style={{ height: '7mm' }} />
        <div>
          <b>Dirección de Inteligencia Artificial</b>Seguimiento de proyectos
        </div>
      </div>
      <div className="foot-r">
        Municipalidad de San Miguel de Tucumán
        <br />
        {pageLabel}
      </div>
    </div>
  )
}

export function ProjectReportScreen() {
  const { user, loading: authLoading, authConfigured } = useAuth()
  const [report, setReport] = useState<ProjectReport | null>(null)
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<number[][] | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const printedRef = useRef(false)

  useEffect(() => {
    if (authConfigured && (authLoading || !user)) return

    let cancelled = false
    loadReportInput()
      .then(({ input, warnings: loadWarnings }) => {
        if (cancelled) return
        const now = new Date()
        setGeneratedAt(now)
        setReport(buildProjectReport(input, now))
        setWarnings(loadWarnings)
        document.title = `Informe de proyectos DIA - ${localIsoDate(now)}`
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'No se pudo generar el informe.')
      })

    return () => {
      cancelled = true
    }
  }, [authConfigured, authLoading, user])

  const blocks = useMemo(() => (report && generatedAt ? buildBlocks(report, generatedAt) : []), [report, generatedAt])

  // Primero se dibujan los bloques fuera de pantalla con el ancho real de la hoja, se miden
  // y recien ahi se reparten en paginas A4.
  useLayoutEffect(() => {
    if (blocks.length === 0 || !measureRef.current) return
    const container = measureRef.current

    let cancelled = false
    void document.fonts.ready.then(() => {
      if (cancelled) return
      const heights = Array.from(container.children).map((child) => child.getBoundingClientRect().height / PX_PER_MM)
      setPages(
        paginateBlocks(
          heights,
          FIRST_PAGE_CAPACITY,
          PAGE_CAPACITY,
          blocks.map((block) => Boolean(block.keepWithNext)),
        ),
      )
    })

    return () => {
      cancelled = true
    }
  }, [blocks])

  // Desde el sidebar se llega con ?descargar=1: se abre el dialogo para guardar el PDF.
  useEffect(() => {
    if (!pages || printedRef.current) return
    if (new URLSearchParams(window.location.search).get('descargar') !== '1') return
    printedRef.current = true

    const images = Array.from(document.querySelectorAll<HTMLImageElement>('#informe img'))
    void Promise.all(images.map((image) => (image.complete ? Promise.resolve() : new Promise((resolve) => image.addEventListener('load', resolve, { once: true })))))
      .then(() => new Promise((resolve) => setTimeout(resolve, 300)))
      .then(() => window.print())
  }, [pages])

  const month = generatedAt ? formatMonthYear(generatedAt) : ''

  return (
    <div id="informe" className="informe-screen">
      <style>{REPORT_CSS}</style>

      <div className="toolbar no-print">
        <Link href="/" className="tb-back">
          <ArrowLeft size={16} /> Volver al dashboard
        </Link>
        <div className="tb-right">
          {pages && <span className="tb-hint">En el diálogo de impresión elegí «Guardar como PDF».</span>}
          <button type="button" className="tb-btn" onClick={() => window.print()} disabled={!pages}>
            {pages ? <Download size={16} /> : <Loader2 size={16} className="spin" />}
            {pages ? 'Descargar PDF' : 'Preparando informe…'}
          </button>
        </div>
      </div>

      {error && <p className="tb-error no-print">{error}</p>}
      {warnings.map((warning) => (
        <p key={warning} className="tb-warning no-print">
          {warning}
        </p>
      ))}

      {blocks.length > 0 && !pages && (
        <div ref={measureRef} className="measure" aria-hidden>
          {blocks.map((block) => (
            <div key={block.key} className={`blk${block.spaced ? ' spaced' : ''}`}>
              {block.node}
            </div>
          ))}
        </div>
      )}

      {pages && generatedAt && report && (
        <div className="sheets">
          {pages.map((pageBlocks, pageIndex) => (
            <section key={pageIndex} className="page">
              {pageIndex === 0 ? (
                <div className="hero">
                  <div className="hero-top">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="logo-smt" src="/informe/logo-smt-blanco.png" alt="Municipalidad de San Miguel de Tucumán" />
                    <div className="chip-ia">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/informe/logo-ia.png" alt="Dirección de Inteligencia Artificial" />
                      <span>Desarrollo</span>
                    </div>
                  </div>
                  <h1>Informe de proyectos</h1>
                  <p className="lead">Estado de los proyectos en desarrollo, en pruebas y en producción al {formatLongDate(generatedAt)}</p>
                </div>
              ) : (
                <div className="band">
                  <h3>{blocks[pageBlocks[0]]?.band ?? 'Informe de proyectos'}</h3>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/informe/logo-smt-blanco.png" alt="" />
                </div>
              )}

              <div className={`body${pageIndex === 0 ? '' : ' body-inner'}`}>
                {pageBlocks.map((blockIndex, position) => {
                  const block = blocks[blockIndex]
                  return (
                    <div key={block.key} className={`blk${block.spaced && position > 0 ? ' spaced' : ''}`}>
                      {block.node}
                    </div>
                  )
                })}
              </div>

              <PageFoot index={pageIndex} total={pages.length} month={month} />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// Estilos de la plantilla institucional (docs/pdf-institucional), acotados a #informe.
const REPORT_CSS = `
@page { size: A4; margin: 0; }

#informe {
  --azul: #126ff5; --azul-med: #2589ea; --azul-hondo: #28469f; --celeste: #3cb4f0;
  --amarillo: #F2D91C; --tinta: #10233d; --texto: #33414f; --gris: #6b7885; --linea: #e3e8ef;
  --verde: #10b981; --ambar: #f59e0b; --rojo: #ef4444;
  min-height: 100vh; background: #e9eef5; padding: 0 0 12mm;
  font-family: "Segoe UI", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif;
  color: var(--texto);
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
#informe * { box-sizing: border-box; }
#informe h1, #informe h2, #informe h3, #informe h4, #informe h5, #informe p, #informe ul { margin: 0; padding: 0; }

/* ── barra de pantalla ── */
#informe .toolbar {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 12px 24px; background: rgba(255,255,255,.92); backdrop-filter: blur(6px); border-bottom: 1px solid #d9e2f2;
}
#informe .tb-back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; color: #40537a; text-decoration: none; }
#informe .tb-right { display: flex; align-items: center; gap: 14px; }
#informe .tb-hint { font-size: 12px; color: var(--gris); }
#informe .tb-btn {
  display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; padding: 9px 16px; cursor: pointer;
  font-size: 14px; font-weight: 700; color: #fff; background: linear-gradient(112deg, #0d3fb0, #126ff5 60%, #2589ea);
}
#informe .tb-btn:disabled { opacity: .7; cursor: progress; }
#informe .spin { animation: informe-spin 1s linear infinite; }
@keyframes informe-spin { to { transform: rotate(360deg); } }
#informe .tb-error, #informe .tb-warning { max-width: 210mm; margin: 16px auto 0; padding: 10px 14px; border-radius: 8px; font-size: 13px; }
#informe .tb-error { background: #fdecee; color: #b4232f; }
#informe .tb-warning { background: #fff6e0; color: #8a5a00; }

#informe .measure { position: absolute; left: -10000px; top: 0; width: 182mm; visibility: hidden; pointer-events: none; font-size: 8pt; line-height: 1.45; }
#informe .sheets { display: flex; flex-direction: column; align-items: center; gap: 8mm; padding-top: 8mm; }

/* ── hoja ── */
#informe .page {
  width: 210mm; height: 297mm; position: relative; overflow: hidden; background: #fff;
  /* Base chica: si no, los textos sueltos heredan la linea de 16px de la app y se separan. */
  font-size: 8pt; line-height: 1.45;
  box-shadow: 0 4mm 12mm rgba(21,39,60,.14);
}
#informe .hero {
  height: 53mm; padding: 11mm 14mm 0; position: relative; display: flex; flex-direction: column;
  background: radial-gradient(120% 150% at 88% 8%, rgba(60,180,240,.42), transparent 58%), linear-gradient(112deg, #0d3fb0 0%, #126ff5 52%, #2589ea 100%);
}
#informe .hero::after, #informe .band::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2.6mm;
  background: linear-gradient(90deg, var(--amarillo) 0%, var(--amarillo) 22%, var(--celeste) 22%, var(--celeste) 100%);
}
#informe .band::after { height: 1.6mm; }
#informe .hero-top { display: flex; align-items: flex-start; justify-content: space-between; }
#informe .logo-smt { height: 11mm; }
#informe .chip-ia { background: #fff; border-radius: 3mm; padding: 2.4mm 4mm 2mm; box-shadow: 0 3mm 8mm rgba(4,26,66,.26); text-align: center; }
#informe .chip-ia img { height: 6.4mm; display: block; }
#informe .chip-ia span { display: block; margin-top: 1mm; font-size: 5.2pt; letter-spacing: .10em; color: #8a949e; text-transform: uppercase; font-weight: 700; }
#informe .hero h1 { color: #fff; font-size: 25pt; font-weight: 800; letter-spacing: -.4pt; margin-top: 6mm; line-height: 1.05; }
#informe .hero .lead { color: #d9eaff; font-size: 10.4pt; margin-top: 2.6mm; max-width: 150mm; line-height: 1.35; }
#informe .band {
  height: 20mm; padding: 0 14mm; display: flex; align-items: center; justify-content: space-between; position: relative;
  background: linear-gradient(112deg, #0d3fb0, #126ff5 60%, #2589ea);
}
#informe .band h3 { color: #fff; font-size: 13pt; font-weight: 800; }
#informe .band img { height: 7.6mm; opacity: .95; }

#informe .body { padding: 8mm 14mm 0; }
#informe .body-inner { padding-top: 7mm; }
#informe .blk.spaced { padding-top: 3.6mm; }
#informe .blk:has(> h2.sec) { padding-top: 6mm; }
#informe .body > .blk:first-child, #informe .measure > .blk:first-child { padding-top: 0; }

#informe h2.sec { font-size: 12.4pt; color: var(--tinta); font-weight: 800; display: flex; align-items: center; gap: 2.6mm; padding-bottom: 3.4mm; }
#informe h2.sec::before { content: ""; width: 1.5mm; height: 5.2mm; border-radius: 1mm; background: linear-gradient(180deg, var(--azul), var(--celeste)); }
#informe p.intro { font-size: 9.9pt; line-height: 1.62; text-align: justify; }
#informe p.intro b { color: var(--tinta); font-weight: 700; }
#informe p.sec-intro { font-size: 8.6pt; line-height: 1.5; color: var(--gris); }

/* ── indicadores ── */
#informe .kpis { display: grid; gap: 3mm; }
#informe .kpis-4 { grid-template-columns: repeat(4, 1fr); }
#informe .kpi { border-radius: 2.6mm; padding: 3mm 3.4mm; background: linear-gradient(160deg,#f6faff,#eaf3ff); border: .35mm solid #d8e6fa; }
#informe .kpi b { display: block; font-size: 13pt; color: var(--tinta); font-weight: 800; line-height: 1.1; }
#informe .kpi span { font-size: 7.3pt; color: var(--gris); line-height: 1.35; }
#informe .kpi.big b { font-size: 19pt; }
#informe .kpi.k-prod { border-left: 1.3mm solid var(--verde); }
#informe .kpi.k-qa { border-left: 1.3mm solid var(--ambar); }
#informe .kpi.k-dev { border-left: 1.3mm solid var(--azul); }

#informe .dist-bar { display: flex; height: 6mm; border-radius: 3mm; overflow: hidden; gap: .6mm; background: #fff; }
#informe .dist-bar i, #informe .dist-legend i { display: block; }
#informe .st-prod { --st: var(--verde); }
#informe .st-qa { --st: var(--ambar); }
#informe .st-dev { --st: var(--azul); }
#informe .dist-bar i { background: var(--st); }
#informe .dist-legend { display: flex; gap: 7mm; margin-top: 2.6mm; font-size: 8.4pt; }
#informe .dist-legend span { display: inline-flex; align-items: center; gap: 1.8mm; }
#informe .dist-legend i { width: 2.6mm; height: 2.6mm; border-radius: 50%; background: var(--st); }
#informe .dist-legend b { color: var(--tinta); }

#informe .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 3.2mm; }
#informe .panel { border: .35mm solid var(--linea); border-left: 1.3mm solid var(--celeste); border-radius: 2.6mm; padding: 3.2mm 4mm; }
#informe .panel-late { border-left-color: var(--rojo); }
#informe .panel h5 { font-size: 8.6pt; color: var(--tinta); font-weight: 800; margin-bottom: 1.2mm; }
#informe .list-empty { font-size: 8pt; color: var(--gris); }
#informe ul.mini { list-style: none; }
#informe ul.mini li { font-size: 8pt; line-height: 1.6; padding-left: 4.4mm; position: relative; }
#informe ul.mini li::before { content: ""; position: absolute; left: 1mm; top: 1.6mm; width: 1.6mm; height: 1.6mm; border-radius: 50%; background: var(--azul); }
#informe .panel-late ul.mini li::before { background: var(--rojo); }
#informe ul.mini li b { color: var(--tinta); font-weight: 700; }

#informe .rank { display: grid; gap: 1.8mm; }
#informe .rank-row { display: grid; grid-template-columns: 52mm 1fr 22mm; align-items: center; gap: 3mm; font-size: 8.2pt; }
#informe .rank-name { color: var(--tinta); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#informe .rank-bar { height: 3mm; border-radius: 1.5mm; background: #eef3fa; overflow: hidden; }
#informe .rank-bar i { display: block; height: 100%; border-radius: 1.5mm; background: linear-gradient(90deg, var(--azul), var(--celeste)); }
#informe .rank-value { color: var(--gris); text-align: right; }

/* ── ficha de proyecto ── */
#informe .pcard {
  border: .35mm solid var(--linea); border-left: 1.3mm solid var(--st); border-radius: 2.6mm; padding: 2.8mm 4mm;
  background: #fff; box-shadow: 0 1.6mm 4mm rgba(21,39,60,.055);
}
#informe .pc-head { display: flex; justify-content: space-between; gap: 5mm; align-items: flex-start; }
#informe .pc-title { min-width: 0; }
#informe .pc-title h4 { font-size: 10.4pt; color: var(--tinta); font-weight: 800; line-height: 1.2; }
#informe .pc-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2.4mm; margin-top: .8mm; font-size: 7.4pt; color: var(--gris); }
#informe .pill { border-radius: 5mm; padding: .5mm 2.2mm; font-size: 6.6pt; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; }
#informe .pr-high { background: #fdecec; color: #c62828; }
#informe .pr-mid { background: #e8f1ff; color: #1557c0; }
#informe .pr-low { background: #eef1f5; color: #5b6774; }
#informe .pc-progress { width: 38mm; flex-shrink: 0; text-align: right; font-size: 7.2pt; color: var(--gris); }
#informe .pc-progress b { font-size: 10pt; color: var(--tinta); font-weight: 800; }
#informe .pc-progress .bar { margin-top: 1mm; height: 2mm; border-radius: 1mm; background: #eef3fa; overflow: hidden; }
#informe .pc-progress .bar i { display: block; height: 100%; background: var(--st); border-radius: 1mm; }
#informe .pc-desc { margin-top: 1.8mm; font-size: 8.3pt; line-height: 1.5; text-align: justify; }
#informe .pc-desc.empty { color: #98a3ae; font-style: italic; }
#informe .pc-facts { display: grid; grid-template-columns: 1fr 1fr 1.25fr 1.15fr; gap: 3mm; margin-top: 2.2mm; padding-top: 2mm; border-top: .3mm dashed var(--linea); line-height: 1.3; }
#informe .pc-facts b { display: block; font-size: 6.6pt; text-transform: uppercase; letter-spacing: .05em; color: #8a949e; font-weight: 700; margin-bottom: .3mm; }
#informe .pc-facts span, #informe .pc-facts a { font-size: 7.8pt; color: var(--texto); line-height: 1.4; overflow-wrap: anywhere; }
#informe .pc-facts a { color: var(--azul); text-decoration: none; }
#informe .pc-facts .muted { color: #98a3ae; }
#informe .flag { font-style: normal; margin-left: 1.4mm; border-radius: 3mm; padding: .2mm 1.6mm; font-size: 6.4pt; font-weight: 700; text-transform: uppercase; }
#informe .flag.late { background: #fdecec; color: #c62828; }
#informe .flag.soon { background: #fff4dc; color: #a86400; }
#informe .pc-line { margin-top: 1.8mm; font-size: 7.8pt; line-height: 1.45; }
#informe .pc-line b { color: var(--tinta); }
#informe .late-text { color: #c62828; }

/* ── seguimiento y cierre ── */
#informe .chips { display: flex; flex-wrap: wrap; gap: 1.6mm; margin-top: 2.6mm; }
#informe .chips span { font-size: 7.6pt; border: .35mm solid #d8e6fa; background: #f6faff; color: var(--tinta); border-radius: 3mm; padding: .8mm 2.6mm; }
#informe .reglas { display: flex; margin-top: 2.8mm; border-radius: 2.4mm; border: .35mm solid #d8e6fa; background: linear-gradient(160deg,#f6faff,#eaf3ff); padding: 2.6mm 0; }
#informe .reglas > div { flex: 1; padding: 0 4mm; border-left: .35mm solid #d3e3f8; }
#informe .reglas > div:first-child { border-left: none; }
#informe .reglas b { display: block; font-size: 13pt; color: var(--tinta); font-weight: 800; }
#informe .reglas span { font-size: 7.4pt; color: var(--gris); }
#informe .cierre { border-radius: 2.8mm; padding: 3.6mm 5mm; color: #fff; background: linear-gradient(112deg,#0d3fb0,#126ff5 60%,#2589ea); }
#informe .cierre b { font-size: 9.2pt; font-weight: 800; display: block; margin-bottom: 1.2mm; }
#informe .cierre p { font-size: 8pt; line-height: 1.5; color: #d9eaff; }
#informe .cap { font-size: 6.8pt; color: #98a3ae; margin-top: 1.8mm; font-style: italic; }

/* ── pie ── */
#informe .foot {
  position: absolute; left: 0; right: 0; bottom: 0; height: 15mm; border-top: .35mm solid var(--linea);
  display: flex; align-items: center; justify-content: space-between; padding: 0 14mm; background: #fbfcfe;
}
#informe .foot-l { display: flex; align-items: center; gap: 3mm; }
#informe .foot-l img { height: 8.4mm; }
#informe .foot-l div { font-size: 6.6pt; color: var(--gris); line-height: 1.4; }
#informe .foot-l b { display: block; color: var(--tinta); font-size: 7.4pt; font-weight: 800; }
#informe .foot-r { font-size: 6.6pt; color: #9aa5b1; text-align: right; line-height: 1.5; }

@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body * { visibility: hidden; }
  #informe, #informe * { visibility: visible; }
  #informe { position: absolute; left: 0; top: 0; padding: 0; background: #fff; min-height: 0; }
  #informe .no-print, #informe .measure { display: none !important; }
  #informe .sheets { display: block; padding: 0; }
  #informe .page { box-shadow: none; break-after: page; }
  /* Las sombras difusas se rasterizan como rectangulos grises en algunos visores de PDF. */
  #informe .chip-ia, #informe .pcard { box-shadow: none; }
  #informe .page:last-child { break-after: auto; }
}
`
