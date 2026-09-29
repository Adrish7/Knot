import Foundation
import ImageIO
import CoreGraphics

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let pngURL = root.appendingPathComponent("assets/icon.png")
let png = try Data(contentsOf: pngURL)
let publicPNG = try Data(contentsOf: root.appendingPathComponent("public/icon.png"))
precondition(png == publicPNG,
    "assets/icon.png and public/icon.png differ")

func check(_ url: URL, size: Int) {
    let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
    let image = CGImageSourceCreateImageAtIndex(source, 0, nil)!
    precondition(image.width == size && image.height == size, "Wrong dimensions: \(url.path)")
    let context = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8,
        bytesPerRow: size * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)!
    context.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
    let pixels = context.data!.assumingMemoryBound(to: UInt8.self)
    var bounds = (left: size, top: size, right: 0, bottom: 0)
    for y in 0..<size {
        for x in 0..<size {
            let alpha = pixels[(y * size + x) * 4 + 3]
            if alpha >= 128 {
                bounds.left = min(bounds.left, x)
                bounds.top = min(bounds.top, y)
                bounds.right = max(bounds.right, x + 1)
                bounds.bottom = max(bounds.bottom, y + 1)
            }
            // Reject the nearly opaque interior that accompanied the old gray system frame.
            if x >= size / 4 && x < size * 3 / 4 && y >= size / 4 && y < size * 3 / 4 {
                precondition(alpha == 255, "Translucent icon interior: \(url.lastPathComponent)")
            }
            if (x == 0 || x == size - 1) && (y == 0 || y == size - 1) {
                precondition(alpha == 0, "Opaque canvas corner: \(url.lastPathComponent)")
            }
        }
    }
    let inset = Double(size) * 100 / 1024
    for edge in [bounds.left, bounds.top, size - bounds.right, size - bounds.bottom] {
        precondition(abs(Double(edge) - inset) <= 1, "Incorrect safe area: \(url.lastPathComponent)")
    }
    print("OK \(url.lastPathComponent): \(size)×\(size), opaque center, transparent corners, correct safe area")
}

check(pngURL, size: 1024)
let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
let iconset = temporary.appendingPathComponent("icon.iconset")
try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
defer { try? FileManager.default.removeItem(at: temporary) }
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "iconset", root.appendingPathComponent("assets/icon.icns").path, "-o", iconset.path]
try process.run()
process.waitUntilExit()
precondition(process.terminationStatus == 0, "Invalid ICNS")
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let suffix = scale == 2 ? "@2x" : ""
        check(iconset.appendingPathComponent("icon_\(size)x\(size)\(suffix).png"), size: size * scale)
    }
}
let icnsPNG = try Data(contentsOf: iconset.appendingPathComponent("icon_512x512@2x.png"))
precondition(png == icnsPNG,
    "ICNS master differs from the PNG; run npm run icons:build")
