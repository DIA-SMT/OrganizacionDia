import { BrandLockup } from '@/components/brand-lockup'
import { CircleCheck } from 'lucide-react'
import Image from 'next/image'

export const AUTH_INPUT_CLASS =
  'mt-2 h-12 w-full rounded-xl border border-[#c9d8ec] bg-white px-3.5 text-[15px] text-[var(--brand-navy)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-[3px] focus:ring-[rgb(0_102_255/12%)]'

export const AUTH_PRIMARY_BUTTON_CLASS =
  'inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full bg-[var(--brand-blue)] px-5 text-[15px] font-bold text-white shadow-[0_10px_22px_rgb(0_102_255/22%)] transition hover:bg-[var(--brand-deep)] disabled:cursor-wait disabled:opacity-60'

export const AUTH_LINK_BUTTON_CLASS =
  'flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-[var(--brand-blue)] hover:bg-[var(--tint-blue)]'

const features = ['Proyectos, entregas y avance del equipo', 'Tareas, revisión y testing', 'Expedientes y Bandeja IA']

/** Pantalla dividida de acceso: portada municipal a la izquierda y tarjeta del formulario a la derecha. */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-[var(--dia-bg)] lg:grid-cols-[1.2fr_0.8fr]">
      <section className="login-brand-panel relative hidden flex-col overflow-hidden border-r border-[var(--dia-border)] px-[clamp(28px,6vw,72px)] pt-8 lg:flex">
        <BrandLockup appName="Organización DIA" appSubtitle="Municipalidad de San Miguel de Tucumán" />

        <div className="relative z-[2] my-auto pb-24">
          <p className="eyebrow">Acceso interno</p>
          <h1 className="mt-5 text-[clamp(3rem,5.4vw,6rem)] font-extrabold leading-[0.96] text-[var(--brand-navy)]">
            Organización
            <span className="block text-[var(--brand-blue)]">DIA</span>
          </h1>
          {/* En xl aparece Migue a la derecha: el texto le deja lugar. */}
          <p className="mt-5 max-w-[520px] text-[clamp(17px,1.15vw,20px)] leading-relaxed text-[#33496b] xl:max-w-[min(520px,calc(100%-250px))]">
            Gestión interna de los proyectos de programación de la Municipalidad de San Miguel de Tucumán.
          </p>
          <ul className="mt-7 grid max-w-[520px] gap-3.5 xl:max-w-[min(520px,calc(100%-250px))]">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-[17px] font-medium text-[var(--brand-navy)]">
                <CircleCheck className="h-6 w-6 shrink-0 fill-[var(--brand-yellow)] text-[var(--brand-navy)]" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <Image
          className="pointer-events-none absolute bottom-[8px] right-[5%] z-[1] hidden h-[min(54vh,500px)] w-auto drop-shadow-[0_16px_24px_rgb(9_35_76/18%)] xl:block"
          src="/migue/portada-dia.webp"
          alt=""
          width={320}
          height={869}
          priority
        />
        <svg className="hero-waves" viewBox="0 0 1440 80" preserveAspectRatio="none" aria-hidden="true">
          <path className="wave-sky" d="M0 34 C 260 4 520 70 820 40 S 1260 6 1440 30 L1440 80 L0 80 Z" />
          <path className="wave-yellow" d="M0 50 C 300 22 560 80 860 54 S 1280 26 1440 46 L1440 80 L0 80 Z" />
          <path className="wave-base" d="M0 62 C 320 40 600 88 900 66 S 1300 44 1440 60 L1440 80 L0 80 Z" />
        </svg>
      </section>

      <section className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="lg:hidden">
          <BrandLockup appName="Organización DIA" appSubtitle="Municipalidad de San Miguel de Tucumán" />
        </div>

        <div className="w-full max-w-[400px] rounded-[22px] border border-[var(--dia-border)] border-t-[5px] border-t-[var(--brand-yellow)] bg-white p-7 shadow-[0_20px_50px_rgb(9_35_76/10%)] sm:p-9">
          {children}
        </div>

        <p className="flex items-center gap-2.5 text-xs text-slate-500">
          <Image className="h-7 w-auto" src="/informe/logo-ia.webp" alt="" width={526} height={220} />
          Desarrollado por la Dirección de Inteligencia Artificial
        </p>
      </section>
    </main>
  )
}
