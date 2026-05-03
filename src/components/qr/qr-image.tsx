import { useEffect, useRef } from "react"
import QRCode from "qrcode"

export function QrImage({ value, size = 128 }: { value: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    QRCode.toCanvas(ref.current, value, {
      width: size,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
  }, [value, size])
  return <canvas ref={ref} style={{ width: size, height: size }} />
}
