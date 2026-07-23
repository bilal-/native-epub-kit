package com.bilal.nativeepubkit

internal object NavigatorHostIdentity {
  fun fragmentTag(instanceId: String, containerId: Int, generation: Long): String {
    require(instanceId.isNotBlank()) { "Native reader instance ID is required" }
    require(generation >= 0) { "Native reader generation must be non-negative" }
    return "native-epub-kit:$instanceId:$containerId:$generation"
  }
}
