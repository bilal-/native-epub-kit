// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "NativeEpubKitContractHarness",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "NativeEpubKitContractHarness", targets: ["NativeEpubKitContractHarness"])
  ],
  targets: [
    .target(name: "NativeEpubKitContractHarness"),
    .testTarget(
      name: "NativeEpubKitContractHarnessTests",
      dependencies: ["NativeEpubKitContractHarness"]
    ),
  ]
)
