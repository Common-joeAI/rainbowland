/**
 * GPUStatus — shows detected encoder + lets user override it.
 * Runs the GPU probe on mount, displays results with visual clarity.
 */
import React, { useState, useEffect } from 'react'
import clsx from 'clsx'
import { Cpu, Zap, RefreshCw, ChevronDown, ChevronUp, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI

export default function GPUStatus({ onEncoderChange }) {
  const { colors } = useTheme()

  const [detecting,    setDetecting]    = useState(false)
  const [gpuResult,    setGpuResult]    = useState(null)
  const [showAll,      setShowAll]      = useState(false)
  const [selectedEnc,  setSelectedEnc]  = useState(null)  // null = auto (best)

  const detect = async (redetect = false) => {
    if (!IS_ELECTRON) return
    setDetecting(true)
    try {
      const result = redetect
        ? await window.electronAPI.redetectGPU()
        : await window.electronAPI.detectGPU()
      setGpuResult(result)
      setSelectedEnc(null)  // reset to auto on new detection
      onEncoderChange?.(null)
    } catch (e) {
      console.error('GPU detect failed:', e)
    }
    setDetecting(false)
  }

  useEffect(() => { detect(false) }, [])

  const handleOverride = (encoder) => {
    const next = encoder === selectedEnc ? null : encoder
    setSelectedEnc(next)
    onEncoderChange?.(next)
  }

  if (!IS_ELECTRON) {
    return (
      <div className="px-3 py-3 rounded-xl border border-white/5 text-xs"
        style={{ background: colors.bg700, color: colors.textMuted }}>
        GPU detection requires the Electron app
      </div>
    )
  }

  return (
    <div className="space-y-2">

      {/* ── Active encoder badge ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {detecting ? (
            <RefreshCw className="w-4 h-4 animate-spin" style={{ color: colors.textMuted }} />
          ) : gpuResult ? (
            <span className="text-lg">{gpuResult.icon}</span>
          ) : (
            <Cpu className="w-4 h-4" style={{ color: colors.textMuted }} />
          )}

          <div>
            {detecting && (
              <p className="text-sm font-bold" style={{ color: colors.textSecondary }}>
                Probing encoders...
              </p>
            )}
            {!detecting && gpuResult && (
              <>
                <p className="text-sm font-bold" style={{ color: colors.textPrimary }}>
                  {selectedEnc
                    ? gpuResult.allResults?.find(r => r.encoder === selectedEnc)?.label || selectedEnc
                    : gpuResult.label}
                  {selectedEnc && (
                    <span className="ml-2 text-xs font-normal" style={{ color: colors.warning }}>
                      (manual override)
                    </span>
                  )}
                </p>
                <p className="text-xs" style={{ color: colors.textMuted }}>
                  {gpuResult.isFallback && !selectedEnc
                    ? 'No GPU encoder found — streaming on CPU'
                    : selectedEnc
                    ? `Overriding auto-select (auto: ${gpuResult.label})`
                    : `Hardware accelerated · ${gpuResult.encoder}`}
                </p>
              </>
            )}
            {!detecting && !gpuResult && (
              <p className="text-sm" style={{ color: colors.textMuted }}>
                Click detect to probe encoders
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => detect(true)}
          disabled={detecting}
          className="p-1.5 rounded-lg transition-colors border border-white/10 hover:border-white/20"
          style={{ background: colors.bg600 }}
          title="Re-probe GPU encoders">
          <RefreshCw className={clsx('w-3.5 h-3.5', detecting && 'animate-spin')}
            style={{ color: colors.textMuted }} />
        </button>
      </div>

      {/* ── Performance indicator ── */}
      {gpuResult && !detecting && (
        <div className="flex items-center gap-1.5">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex-1 h-1.5 rounded-full"
              style={{
                background: i <= (gpuResult.isFallback && !selectedEnc ? 2 : 5)
                  ? (gpuResult.isFallback && !selectedEnc ? colors.warning : colors.success)
                  : colors.bg500
              }} />
          ))}
          <span className="text-[10px] ml-1" style={{ color: colors.textMuted }}>
            {gpuResult.isFallback && !selectedEnc ? 'CPU · limited destinations' : 'GPU · full speed'}
          </span>
        </div>
      )}

      {/* ── All encoder results (expandable) ── */}
      {gpuResult?.allResults?.length > 0 && (
        <>
          <button
            onClick={() => setShowAll(s => !s)}
            className="flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: colors.textMuted }}>
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? 'Hide' : 'Show'} all encoders
          </button>

          {showAll && (
            <div className="space-y-1.5 pt-1">
              {/* Auto option */}
              <button
                onClick={() => { setSelectedEnc(null); onEncoderChange?.(null) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left"
                style={{
                  background:  !selectedEnc ? `${colors.primary}15` : colors.bg700,
                  borderColor: !selectedEnc ? `${colors.primary}55`  : 'rgba(255,255,255,0.07)',
                }}>
                <Zap className="w-4 h-4 flex-shrink-0" style={{ color: !selectedEnc ? colors.primary : colors.textMuted }} />
                <div className="flex-1">
                  <p className="text-xs font-bold" style={{ color: !selectedEnc ? colors.primary : colors.textPrimary }}>
                    Auto (recommended)
                  </p>
                  <p className="text-[10px]" style={{ color: colors.textMuted }}>
                    Use best available: {gpuResult.label}
                  </p>
                </div>
                {!selectedEnc && <CheckCircle className="w-3.5 h-3.5" style={{ color: colors.primary }} />}
              </button>

              {/* Per-encoder rows */}
              {gpuResult.allResults.map(r => {
                const isSelected = selectedEnc === r.encoder
                const isAuto     = r.encoder   === gpuResult.encoder && !selectedEnc
                return (
                  <button
                    key={r.encoder}
                    onClick={() => r.supported && handleOverride(r.encoder)}
                    disabled={!r.supported}
                    className={clsx(
                      'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left',
                      !r.supported && 'opacity-40 cursor-not-allowed'
                    )}
                    style={{
                      background:  isSelected ? `${colors.primary}15` : colors.bg700,
                      borderColor: isSelected ? `${colors.primary}55`  : 'rgba(255,255,255,0.07)',
                    }}>
                    <span className="text-base flex-shrink-0">{r.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate"
                        style={{ color: isSelected ? colors.primary : colors.textPrimary }}>
                        {r.label}
                      </p>
                      <p className="text-[10px] font-mono" style={{ color: colors.textMuted }}>
                        {r.encoder}
                        {r.reason && r.reason !== 'ok' && ` · ${r.reason}`}
                      </p>
                    </div>
                    {r.supported
                      ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.success }} />
                      : <XCircle    className="w-3.5 h-3.5 flex-shrink-0" style={{ color: colors.textMuted }} />}
                    {isSelected && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: `${colors.primary}25`, color: colors.primary }}>
                        active
                      </span>
                    )}
                  </button>
                )
              })}

              {/* ffmpeg path */}
              {gpuResult.ffmpegPath && (
                <p className="text-[10px] px-1 pt-1 font-mono break-all" style={{ color: colors.textMuted }}>
                  {gpuResult.ffmpegPath}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* CPU warning */}
      {gpuResult?.isFallback && !selectedEnc && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl"
          style={{ background: `${colors.warning}12`, border: `1px solid ${colors.warning}30` }}>
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: colors.warning }} />
          <div>
            <p className="text-xs font-bold" style={{ color: colors.warning }}>CPU encoding active</p>
            <p className="text-[10px]" style={{ color: colors.textMuted }}>
              Install NVIDIA / AMD drivers and ensure ffmpeg is built with NVENC/AMF support.
              CPU can handle 1–2 destinations; GPU handles 5+ simultaneously.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
