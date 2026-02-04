// ABOUTME: Service layer for running PullRead sync commands
// ABOUTME: Executes bundled pullread binary for article syncing

import Foundation

class SyncService {
    private let configDir: String
    private let binaryPath: String

    init() {
        // Config is stored in ~/.config/pullread/
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        configDir = "\(home)/.config/pullread"

        // Binary is bundled in app resources
        if let resourcePath = Bundle.main.resourcePath {
            binaryPath = "\(resourcePath)/pullread"
        } else {
            binaryPath = ""
        }
    }

    func isBinaryAvailable() -> Bool {
        return FileManager.default.fileExists(atPath: binaryPath)
    }

    func getConfigPath() -> String {
        return "\(configDir)/feeds.json"
    }

    func getConfigDir() -> String {
        return configDir
    }

    func getOutputPath() -> String? {
        let configPath = getConfigPath()

        guard FileManager.default.fileExists(atPath: configPath),
              let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let outputPath = json["outputPath"] as? String else {
            return nil
        }

        // Expand ~ to home directory
        if outputPath.hasPrefix("~") {
            let home = FileManager.default.homeDirectoryForCurrentUser.path
            return outputPath.replacingOccurrences(of: "~", with: home)
        }

        return outputPath
    }

    /// Checks if the configuration file exists and has valid content
    func isConfigValid() -> Bool {
        let configPath = getConfigPath()

        guard FileManager.default.fileExists(atPath: configPath),
              let data = FileManager.default.contents(atPath: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let outputPath = json["outputPath"] as? String,
              !outputPath.isEmpty,
              let feeds = json["feeds"] as? [String: String],
              !feeds.isEmpty else {
            return false
        }

        return true
    }

    /// Checks if this appears to be a first run (no config file exists)
    func isFirstRun() -> Bool {
        return !FileManager.default.fileExists(atPath: getConfigPath())
    }

    func sync(retryFailed: Bool, completion: @escaping (Result<String, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }

            let result = self.runSyncCommand(retryFailed: retryFailed)
            completion(result)
        }
    }

    private func runSyncCommand(retryFailed: Bool) -> Result<String, Error> {
        guard isBinaryAvailable() else {
            return .failure(NSError(
                domain: "PullRead",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "PullRead binary not found in app bundle"]
            ))
        }

        let process = Process()
        let pipe = Pipe()
        let errorPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: binaryPath)

        // Build arguments
        var args = ["sync", "--config-path", getConfigPath(), "--data-path", "\(configDir)/pullread.db"]
        if retryFailed {
            args.append("--retry-failed")
        }
        process.arguments = args

        process.standardOutput = pipe
        process.standardError = errorPipe

        do {
            try process.run()
            process.waitUntilExit()

            let outputData = pipe.fileHandleForReading.readDataToEndOfFile()
            let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()

            let output = String(data: outputData, encoding: .utf8) ?? ""
            let errorOutput = String(data: errorData, encoding: .utf8) ?? ""

            // Log to file
            logOutput(output + errorOutput)

            if process.terminationStatus == 0 {
                return .success(output)
            } else {
                let message = errorOutput.isEmpty ? "Sync failed with exit code \(process.terminationStatus)" : errorOutput
                return .failure(NSError(domain: "PullRead", code: Int(process.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message]))
            }
        } catch {
            return .failure(error)
        }
    }

    private func logOutput(_ output: String) {
        let logPath = "/tmp/pullread.log"
        let timestamp = ISO8601DateFormatter().string(from: Date())
        let logEntry = "\n[\(timestamp)]\n\(output)\n"

        if let data = logEntry.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: logPath) {
                if let fileHandle = FileHandle(forWritingAtPath: logPath) {
                    fileHandle.seekToEndOfFile()
                    fileHandle.write(data)
                    fileHandle.closeFile()
                }
            } else {
                FileManager.default.createFile(atPath: logPath, contents: data)
            }
        }
    }
}
