import React, { useEffect, useMemo, useState } from 'react'

type Point = { x: number; y: number }
type PanelPolygon = { id: string; corners: Point[] }
type Mode = 'installable' | 'keepout' | 'calibrate'
type OrientationMode = 'auto' | 'manual'

type DrawState = {
  active: boolean
  points: Point[]
}

const NOTES = [
  '1. Upload a satellite or Google Maps screenshot.',
  '2. Draw a calibration line over a known dimension, then enter the real length in feet.',
  '3. Sketch the usable rooftop area.',
  '4. Sketch keep-out zones for HVAC, access paths, and obstructions.',
  '5. Review the indicative panel layout, DC size, AC size, and annual energy.',
]

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function centroid(points: Point[]): Point {
  if (!points.length) return { x: 0, y: 0 }
  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 },
  )
  return { x: sum.x / points.length, y: sum.y / points.length }
}

function rotatePoint(p: Point, origin: Point, angleDeg: number): Point {
  const angle = (angleDeg * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

function rotatePolygon(points: Point[], origin: Point, angleDeg: number) {
  return points.map((p) => rotatePoint(p, origin, angleDeg))
}

function getBounds(points: Point[]) {
  if (!points.length) return null
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function pointInPolygon(point: Point, polygon: Point[]) {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 0.0000001) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function simplifyStroke(points: Point[], minStep = 6) {
  if (points.length <= 2) return points
  const result = [points[0]]
  let last = points[0]
  for (let i = 1; i < points.length - 1; i++) {
    if (distance(last, points[i]) >= minStep) {
      result.push(points[i])
      last = points[i]
    }
  }
  result.push(points[points.length - 1])
  return result
}

function pointsToPath(points: Point[], close = true) {
  if (!points.length) return ''
  const first = points[0]
  const rest = points.slice(1)
  return `M ${first.x} ${first.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')} ${close ? 'Z' : ''}`
}

function polygonAreaSqPx(points: Point[]) {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y - points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

function polygonInsideAny(point: Point, polygons: Point[][]) {
  return polygons.some((poly) => pointInPolygon(point, poly))
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

function useObjectUrl(file: File | null) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) {
      setUrl('')
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return url
}

function getEdgeAngleDegrees(a: Point, b: Point) {
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  return ((angle % 180) + 180) % 180
}

function getDominantPolygonAngle(points: Point[]) {
  if (points.length < 2) return 0
  let bestLength = 0
  let bestAngle = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const len = distance(a, b)
    if (len > bestLength) {
      bestLength = len
      bestAngle = getEdgeAngleDegrees(a, b)
    }
  }
  return bestAngle
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-100">{value}</div>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<Mode>('installable')
  const [orientationMode, setOrientationMode] = useState<OrientationMode>('auto')

  const [imageFile, setImageFile] = useState<File | null>(null)
  const imageUrl = useObjectUrl(imageFile)

  const [drawState, setDrawState] = useState<DrawState>({ active: false, points: [] })
  const [installablePolygon, setInstallablePolygon] = useState<Point[]>([])
  const [keepouts, setKeepouts] = useState<Point[][]>([])
  const [calibrationLine, setCalibrationLine] = useState<Point[]>([])

  const [calibrationFeet, setCalibrationFeet] = useState(100)
  const [panelLengthFt, setPanelLengthFt] = useState(7.5)
  const [panelWidthFt, setPanelWidthFt] = useState(3.75)
  const [panelWatts, setPanelWatts] = useState(545)
  const [rowGapFt, setRowGapFt] = useState(8.5 / 12)
  const [moduleGapFt, setModuleGapFt] = useState(0.5 / 12)
  const [setbackFt, setSetbackFt] = useState(1.5)
  const [orientationDeg, setOrientationDeg] = useState(0)
  const [specificYield, setSpecificYield] = useState(1300)
  const [dcAcRatio, setDcAcRatio] = useState(1.2)

  const canvasWidth = 1200
  const canvasHeight = 800

  const pxPerFoot = useMemo(() => {
    if (calibrationLine.length !== 2 || calibrationFeet <= 0) return 0
    const px = distance(calibrationLine[0], calibrationLine[1])
    return px / calibrationFeet
  }, [calibrationFeet, calibrationLine])

  const roofAngleDeg = useMemo(() => {
    if (!installablePolygon.length) return 0
    return getDominantPolygonAngle(installablePolygon)
  }, [installablePolygon])

  const computeLayoutForAngle = (testAngleDeg: number) => {
    if (!installablePolygon.length || pxPerFoot <= 0) {
      return { panels: [] as PanelPolygon[], panelCount: 0, kwDc: 0, kwAc: 0, annualKwh: 0, angleDeg: testAngleDeg }
    }

    const origin = centroid(installablePolygon)
    const rotatedInstallable = rotatePolygon(installablePolygon, origin, -testAngleDeg)
    const rotatedKeepouts = keepouts.map((poly) => rotatePolygon(poly, origin, -testAngleDeg))
    const bounds = getBounds(rotatedInstallable)
    if (!bounds) {
      return { panels: [] as PanelPolygon[], panelCount: 0, kwDc: 0, kwAc: 0, annualKwh: 0, angleDeg: testAngleDeg }
    }

    const panelW = panelWidthFt * pxPerFoot
    const panelH = panelLengthFt * pxPerFoot
    const rowGap = rowGapFt * pxPerFoot
    const moduleGap = moduleGapFt * pxPerFoot
    const margin = setbackFt * pxPerFoot

    const panels: PanelPolygon[] = []
    let id = 0

    for (let y = bounds.minY + panelH / 2 + margin; y <= bounds.maxY - panelH / 2 - margin; y += panelH + rowGap) {
      for (let x = bounds.minX + panelW / 2 + margin; x <= bounds.maxX - panelW / 2 - margin; x += panelW + moduleGap) {
        const expandedCorners: Point[] = [
          { x: x - panelW / 2 - margin, y: y - panelH / 2 - margin },
          { x: x + panelW / 2 + margin, y: y - panelH / 2 - margin },
          { x: x + panelW / 2 + margin, y: y + panelH / 2 + margin },
          { x: x - panelW / 2 - margin, y: y + panelH / 2 + margin },
        ]

        const samplePoints = [
          ...expandedCorners,
          { x, y },
          { x, y: y - panelH / 2 - margin },
          { x, y: y + panelH / 2 + margin },
          { x: x - panelW / 2 - margin, y },
          { x: x + panelW / 2 + margin, y },
        ]

        const insideInstallable = samplePoints.every((p) => pointInPolygon(p, rotatedInstallable))
        const touchesKeepout = samplePoints.some((p) => polygonInsideAny(p, rotatedKeepouts))

        if (!insideInstallable || touchesKeepout) continue

        const actualCorners = [
          { x: x - panelW / 2, y: y - panelH / 2 },
          { x: x + panelW / 2, y: y - panelH / 2 },
          { x: x + panelW / 2, y: y + panelH / 2 },
          { x: x - panelW / 2, y: y + panelH / 2 },
        ].map((corner) => rotatePoint(corner, origin, testAngleDeg))

        panels.push({ id: `p-${id++}`, corners: actualCorners })
      }
    }

    const panelCount = panels.length
    const kwDc = (panelCount * panelWatts) / 1000
    const kwAc = kwDc / Math.max(dcAcRatio, 0.01)
    const annualKwh = kwDc * specificYield

    return { panels, panelCount, kwDc, kwAc, annualKwh, angleDeg: testAngleDeg }
  }

  const layout = useMemo(() => {
    if (!installablePolygon.length || pxPerFoot <= 0) {
      return { panels: [] as PanelPolygon[], panelCount: 0, kwDc: 0, kwAc: 0, annualKwh: 0, angleDeg: 0 }
    }

    if (orientationMode === 'manual') {
      return computeLayoutForAngle(orientationDeg)
    }

    const roofAligned = computeLayoutForAngle(roofAngleDeg)
    const roofPerpendicular = computeLayoutForAngle((roofAngleDeg + 90) % 180)
    return roofPerpendicular.panelCount > roofAligned.panelCount ? roofPerpendicular : roofAligned
  }, [
    installablePolygon,
    keepouts,
    pxPerFoot,
    orientationMode,
    orientationDeg,
    roofAngleDeg,
    panelLengthFt,
    panelWidthFt,
    rowGapFt,
    moduleGapFt,
    setbackFt,
    panelWatts,
    specificYield,
    dcAcRatio,
  ])

  const installableAreaSqFt = useMemo(() => {
    if (!installablePolygon.length || !pxPerFoot) return 0
    return polygonAreaSqPx(installablePolygon) / (pxPerFoot * pxPerFoot)
  }, [installablePolygon, pxPerFoot])

  const keepoutAreaSqFt = useMemo(() => {
    if (!keepouts.length || !pxPerFoot) return 0
    return keepouts.reduce((sum, poly) => sum + polygonAreaSqPx(poly), 0) / (pxPerFoot * pxPerFoot)
  }, [keepouts, pxPerFoot])

  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
      y: ((event.clientY - rect.top) / rect.height) * canvasHeight,
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {}
    setDrawState({ active: true, points: [point] })
  }

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawState.active) return
    const rect = event.currentTarget.getBoundingClientRect()
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * canvasWidth,
      y: ((event.clientY - rect.top) / rect.height) * canvasHeight,
    }
    setDrawState((prev) => {
      const last = prev.points[prev.points.length - 1]
      if (last && distance(last, point) < 3) return prev
      return { active: true, points: [...prev.points, point] }
    })
  }

  const onPointerUp = () => {
    if (!drawState.active) return

    if (mode === 'calibrate') {
      const first = drawState.points[0]
      const last = drawState.points[drawState.points.length - 1]
      if (first && last && distance(first, last) > 12) {
        setCalibrationLine([first, last])
      }
      setDrawState({ active: false, points: [] })
      return
    }

    const polygon = simplifyStroke(drawState.points, 10)
    if (polygon.length >= 3) {
      if (mode === 'installable') setInstallablePolygon(polygon)
      if (mode === 'keepout') setKeepouts((prev) => [...prev, polygon])
    }
    setDrawState({ active: false, points: [] })
  }

  const activeStrokePath = useMemo(() => {
    if (!drawState.points.length) return ''
    return pointsToPath(drawState.points, mode !== 'calibrate')
  }, [drawState.points, mode])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto grid max-w-7xl gap-4 p-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold">SolarSketch</h1>
                <p className="text-sm text-slate-400">Stylus-first rooftop solar feasibility</p>
              </div>
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                MVP
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-300">
              {NOTES.map((note) => (
                <div key={note} className="rounded-2xl bg-slate-800/50 px-3 py-2">
                  {note}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="mb-3 text-lg font-semibold">Background image</h2>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900">
                Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <button
                onClick={() => {
                  setImageFile(null)
                  setInstallablePolygon([])
                  setKeepouts([])
                  setCalibrationLine([])
                }}
                className="rounded-2xl border border-slate-700 px-4 py-2 text-sm"
              >
                Reset
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Use a Google Maps or satellite screenshot for the demo.</p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="mb-3 text-lg font-semibold">Sketch mode</h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: 'calibrate', label: 'Calibrate' },
                { key: 'installable', label: 'Installable' },
                { key: 'keepout', label: 'Keep-out' },
              ] as const).map((item) => (
                <button
                  key={item.key}
                  onClick={() => setMode(item.key)}
                  className={`rounded-2xl px-3 py-2 text-sm font-medium ${
                    mode === item.key ? 'bg-amber-400 text-slate-950' : 'border border-slate-700 text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setKeepouts((prev) => prev.slice(0, -1))}
                className="rounded-2xl border border-slate-700 px-3 py-2 text-sm"
              >
                Undo keep-out
              </button>
              <button
                onClick={() => setInstallablePolygon([])}
                className="rounded-2xl border border-slate-700 px-3 py-2 text-sm"
              >
                Clear roof
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="mb-3 text-lg font-semibold">Project inputs</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="space-y-1">
                <span className="text-slate-400">Known distance (ft)</span>
                <input
                  type="number"
                  value={calibrationFeet}
                  onChange={(e) => setCalibrationFeet(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Panel watts</span>
                <input
                  type="number"
                  value={panelWatts}
                  onChange={(e) => setPanelWatts(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Panel length (ft)</span>
                <input
                  type="number"
                  step="0.1"
                  value={panelLengthFt}
                  onChange={(e) => setPanelLengthFt(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Panel width (ft)</span>
                <input
                  type="number"
                  step="0.1"
                  value={panelWidthFt}
                  onChange={(e) => setPanelWidthFt(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Row spacing (ft)</span>
                <input
                  type="number"
                  step="0.05"
                  value={rowGapFt}
                  onChange={(e) => setRowGapFt(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Module spacing (ft)</span>
                <input
                  type="number"
                  step="0.01"
                  value={moduleGapFt}
                  onChange={(e) => setModuleGapFt(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Setback buffer (ft)</span>
                <input
                  type="number"
                  step="0.1"
                  value={setbackFt}
                  onChange={(e) => setSetbackFt(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Orientation mode</span>
                <select
                  value={orientationMode}
                  onChange={(e) => setOrientationMode(e.target.value as OrientationMode)}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                >
                  <option value="auto">Auto: follow roof and maximize count</option>
                  <option value="manual">Manual angle</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">Manual angle (deg)</span>
                <input
                  type="number"
                  step="1"
                  value={orientationDeg}
                  onChange={(e) => setOrientationDeg(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-slate-400">DC/AC ratio</span>
                <input
                  type="number"
                  step="0.05"
                  value={dcAcRatio}
                  onChange={(e) => setDcAcRatio(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
              <label className="col-span-2 space-y-1">
                <span className="text-slate-400">Specific yield (kWh per kWdc per year)</span>
                <input
                  type="number"
                  step="10"
                  value={specificYield}
                  onChange={(e) => setSpecificYield(Number(e.target.value))}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              This is a fast feasibility tool, not a final engineering design tool.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5">
            <h2 className="mb-3 text-lg font-semibold">Results</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Metric label="Calibrated scale" value={pxPerFoot ? `${formatNumber(pxPerFoot, 2)} px/ft` : 'Not set'} />
              <Metric label="Roof area" value={installableAreaSqFt ? `${formatNumber(installableAreaSqFt)} sf` : '—'} />
              <Metric label="Keep-out area" value={keepoutAreaSqFt ? `${formatNumber(keepoutAreaSqFt)} sf` : '—'} />
              <Metric label="Panel count" value={layout.panelCount ? formatNumber(layout.panelCount) : '—'} />
              <Metric label="DC size" value={layout.kwDc ? `${formatNumber(layout.kwDc, 1)} kWdc` : '—'} />
              <Metric label="AC size" value={layout.kwAc ? `${formatNumber(layout.kwAc, 1)} kWac` : '—'} />
              <Metric label="Annual energy" value={layout.annualKwh ? `${formatNumber(layout.annualKwh)} kWh` : '—'} />
              <Metric label="Layout angle" value={layout.panelCount ? `${formatNumber(layout.angleDeg, 1)}°` : '—'} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Sketch canvas</h2>
              <p className="text-sm text-slate-400">Mouse on MacBook, stylus on tablet</p>
            </div>
            <div className="rounded-full border border-slate-700 px-3 py-1 text-xs uppercase tracking-wide text-slate-300">
              Mode: {mode}
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950">
            <svg
              viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
              className="aspect-[4/3] w-full touch-none bg-slate-950"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={() => {
                if (drawState.active) onPointerUp()
              }}
            >
              {imageUrl ? (
                <image
                  href={imageUrl}
                  x={0}
                  y={0}
                  width={canvasWidth}
                  height={canvasHeight}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#020617" />
              )}

              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
                </pattern>
              </defs>
              <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="url(#grid)" />

              {installablePolygon.length >= 3 && (
                <path d={pointsToPath(installablePolygon)} fill="rgba(59,130,246,0.20)" stroke="#60a5fa" strokeWidth={4} />
              )}

              {keepouts.map((poly, index) => (
                <path key={`keepout-${index}`} d={pointsToPath(poly)} fill="rgba(249,115,22,0.45)" stroke="#fb923c" strokeWidth={4} />
              ))}

              {layout.panels.map((panel) => (
                <path
                  key={panel.id}
                  d={pointsToPath(panel.corners)}
                  fill="rgba(37,99,235,0.62)"
                  stroke="rgba(191,219,254,0.95)"
                  strokeWidth={1.5}
                />
              ))}

              {calibrationLine.length === 2 && (
                <g>
                  <line
                    x1={calibrationLine[0].x}
                    y1={calibrationLine[0].y}
                    x2={calibrationLine[1].x}
                    y2={calibrationLine[1].y}
                    stroke="#facc15"
                    strokeWidth={5}
                    strokeDasharray="14 10"
                  />
                  <circle cx={calibrationLine[0].x} cy={calibrationLine[0].y} r={8} fill="#facc15" />
                  <circle cx={calibrationLine[1].x} cy={calibrationLine[1].y} r={8} fill="#facc15" />
                </g>
              )}

              {!!activeStrokePath && (
                <path
                  d={activeStrokePath}
                  fill={
                    mode === 'calibrate'
                      ? 'none'
                      : mode === 'installable'
                        ? 'rgba(59,130,246,0.18)'
                        : 'rgba(249,115,22,0.30)'
                  }
                  stroke={mode === 'calibrate' ? '#facc15' : mode === 'installable' ? '#60a5fa' : '#fb923c'}
                  strokeWidth={4}
                  strokeDasharray={mode === 'calibrate' ? '14 10' : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300">
              <div className="font-medium text-slate-100">What it does well</div>
              <div className="mt-1">Fast rooftop feasibility sizing before detailed HelioScope work.</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300">
              <div className="font-medium text-slate-100">What is approximate</div>
              <div className="mt-1">No shading engine, code setback engine, structural review, or final production model yet.</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950/80 p-3 text-sm text-slate-300">
              <div className="font-medium text-slate-100">Best next upgrade</div>
              <div className="mt-1">Add address-based irradiance, smarter roof azimuth logic, and portrait-landscape switching.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
