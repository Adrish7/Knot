import AppKit
import ImageIO

// Preserve the artwork; normalize only the macOS canvas, opacity and size set.
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceURL = root.appendingPathComponent("assets/icon-source.png")
guard let imageSource = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let source = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
    fatalError("Cannot read assets/icon-source.png")
}
let width = source.width
let height = source.height
let space = CGColorSpace(name: CGColorSpace.sRGB)!
func bitmap(_ width: Int, _ height: Int) -> CGContext {
    CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: width * 4, space: space,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
}
let inputContext = bitmap(width, height)
inputContext.draw(source, in: CGRect(x: 0, y: 0, width: width, height: height))
let input = inputContext.data!.assumingMemoryBound(to: UInt8.self)
var bounds = (left: width, top: height, right: 0, bottom: 0)
for y in 0..<height {
    for x in 0..<width where input[(y * width + x) * 4 + 3] >= 128 {
        bounds.left = min(bounds.left, x)
        bounds.top = min(bounds.top, y)
        bounds.right = max(bounds.right, x + 1)
        bounds.bottom = max(bounds.bottom, y + 1)
    }
}
let bodyWidth = bounds.right - bounds.left
let bodyHeight = bounds.bottom - bounds.top
precondition(bodyWidth > 0 && abs(bodyWidth - bodyHeight) <= 2, "Icon body must be square")
let body = bitmap(bodyWidth, bodyHeight)
let output = body.data!.assumingMemoryBound(to: UInt8.self)
for y in 0..<bodyHeight {
    for x in 0..<bodyWidth {
        let i = ((y + bounds.top) * width + x + bounds.left) * 4
        let o = (y * bodyWidth + x) * 4
        let originalAlpha = Double(input[i + 3])
        // Remove background noise; saturate the nearly opaque body while retaining smooth edges.
        let alpha = min(255, max(0, (originalAlpha - 8) * 255 / 242))
        for channel in 0..<3 {
            output[o + channel] = originalAlpha == 0 ? 0 : UInt8(min(255,
                (Double(input[i + channel]) * alpha / originalAlpha).rounded()))
        }
        output[o + 3] = UInt8(alpha.rounded())
    }
}
let canvas = bitmap(1024, 1024)
canvas.interpolationQuality = .high
canvas.draw(body.makeImage()!, in: CGRect(x: 100, y: 100, width: 824, height: 824))
let image = canvas.makeImage()!
let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:])!
try png.write(to: root.appendingPathComponent("assets/icon.png"))
try png.write(to: root.appendingPathComponent("public/icon.png"))

func run(_ executable: String, _ arguments: [String]) throws {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: executable)
    process.arguments = arguments
    process.standardOutput = FileHandle.nullDevice
    try process.run()
    process.waitUntilExit()
    precondition(process.terminationStatus == 0, "Icon command failed: \(executable)")
}
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
let iconset = temporary.appendingPathComponent("icon.iconset")
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: temporary) }
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = String(size * scale)
        let suffix = scale == 2 ? "@2x" : ""
        try run("/usr/bin/sips", ["-z", pixels, pixels, root.appendingPathComponent("assets/icon.png").path,
            "--out", iconset.appendingPathComponent("icon_\(size)x\(size)\(suffix).png").path])
    }
}
try run("/usr/bin/iconutil", ["-c", "icns", iconset.path, "-o", root.appendingPathComponent("assets/icon.icns").path])
print("Built 1024×1024 icon: 824×824 opaque body, 100px inset, all 10 ICNS representations.")
