import Darwin
import Foundation

enum PublicationProcessMemory {
  static func residentBytes() -> Int64? {
    var info = mach_task_basic_info_data_t()
    var count = mach_msg_type_number_t(
      MemoryLayout<mach_task_basic_info_data_t>.size / MemoryLayout<natural_t>.size
    )
    let result = withUnsafeMutablePointer(to: &info) { pointer in
      pointer.withMemoryRebound(to: integer_t.self, capacity: Int(count)) { rebound in
        task_info(
          mach_task_self_,
          task_flavor_t(MACH_TASK_BASIC_INFO),
          rebound,
          &count
        )
      }
    }
    guard result == KERN_SUCCESS else {
      return nil
    }
    return Int64(info.resident_size)
  }
}
