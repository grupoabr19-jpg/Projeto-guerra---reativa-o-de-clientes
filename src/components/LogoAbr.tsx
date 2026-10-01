import React, { useState } from 'react'
import logoAbrAsset from '@/assets/logo-abr-oficial-bf48e.png'

export interface LogoAbrProps {
  className?: string
  alt?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Fallback SVG estilizado da marca Grupo ABR ("Seu parceiraço!")
 * Exibido caso o arquivo de imagem demore ou falhe ao carregar,
 * garantindo que a aplicação NUNCA exiba imagem quebrada ou ícone de erro.
 */
export const LogoAbrFallback: React.FC<{ className?: string }> = ({
  className = 'h-full w-full',
}) => (
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Grupo ABR — Seu parceiraço!"
  >
    <rect width="120" height="120" rx="20" fill="#253575" />
    {/* Grafismo Curva Laranja ABR */}
    <path
      d="M20 95 C 45 95, 75 80, 100 50"
      stroke="#F18800"
      strokeWidth="8"
      strokeLinecap="round"
    />
    <circle cx="100" cy="50" r="5" fill="#F18800" />
    {/* Letras ABR */}
    <text
      x="60"
      y="55"
      textAnchor="middle"
      fill="#FFFFFF"
      fontFamily="Montserrat, ui-sans-serif, system-ui, -apple-system, sans-serif"
      fontWeight="900"
      fontSize="30"
      letterSpacing="2"
    >
      ABR
    </text>
    {/* Subtítulo GRUPO */}
    <text
      x="60"
      y="30"
      textAnchor="middle"
      fill="#F18800"
      fontFamily="Montserrat, ui-sans-serif, system-ui, -apple-system, sans-serif"
      fontWeight="800"
      fontSize="11"
      letterSpacing="3"
    >
      GRUPO
    </text>
    {/* Assinatura "Seu parceiraço!" */}
    <text
      x="60"
      y="84"
      textAnchor="middle"
      fill="#FFFFFF"
      fontFamily="Montserrat, ui-sans-serif, system-ui, -apple-system, sans-serif"
      fontWeight="700"
      fontSize="8.5"
      opacity="0.95"
    >
      Seu parceiraço!
    </text>
  </svg>
)

/**
 * Componente oficial de exibição do Logo Grupo ABR.
 * Importa o asset via ESModule para Vite processar no bundle de produção (/dist/assets/...).
 * Inclui tratamento onError para renderizar o fallback SVG automaticamente caso o arquivo falhe.
 */
export const LogoAbr: React.FC<LogoAbrProps> = ({
  className = 'h-11 w-11 rounded-lg object-contain',
  alt = 'Grupo ABR — Seu parceiraço!',
}) => {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className={`${className} flex items-center justify-center overflow-hidden bg-[#253575]`}>
        <LogoAbrFallback className="h-full w-full" />
      </div>
    )
  }

  return (
    <img
      src={logoAbrAsset}
      alt={alt}
      onError={() => setHasError(true)}
      className={className}
      loading="eager"
      decoding="async"
    />
  )
}

export default LogoAbr
