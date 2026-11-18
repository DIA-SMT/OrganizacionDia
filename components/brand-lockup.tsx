import Image from 'next/image'

type BrandLockupProps = {
  appName: string
  appSubtitle: string
  /** Solo el logo de la Direccion de IA, sin el nombre del sistema (menu de celular). */
  logoOnly?: boolean
  isDark?: boolean
}

/** Marca combinada: logo oficial de la Direccion de IA + nombre del sistema. */
export function BrandLockup({ appName, appSubtitle, logoOnly = false, isDark = false }: BrandLockupProps) {
  return (
    <span className="flex min-w-0 items-center gap-2.5 text-left sm:gap-3">
      {/* Logo positivo (texto gris): en el tema oscuro va sobre una placa blanca para no perder contraste. */}
      <span className={`flex shrink-0 items-center ${isDark ? 'rounded-lg bg-white px-1.5 py-1' : ''}`}>
        <Image
          className="h-7 w-auto sm:h-10"
          src="/informe/logo-ia.webp"
          alt="Dirección de IA"
          width={526}
          height={220}
          priority
        />
      </span>
      {!logoOnly && (
        <>
          <i aria-hidden="true" className={`h-9 w-[1.5px] shrink-0 ${isDark ? 'bg-slate-700' : 'bg-[#c5d6ec]'}`} />
          <span className="min-w-0">
            <b
              className={`block truncate font-[family-name:var(--font-display)] text-[15px] font-extrabold leading-none sm:text-xl ${
                isDark ? 'text-blue-300' : 'text-[var(--brand-blue)]'
              }`}
            >
              {appName}
            </b>
            <small className="mt-0.5 hidden truncate text-[11px] text-slate-500 sm:block">{appSubtitle}</small>
          </span>
        </>
      )}
    </span>
  )
}
