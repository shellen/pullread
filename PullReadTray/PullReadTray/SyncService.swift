// ABOUTME: Service layer for running PullRead sync commands
// ABOUTME: Handles Node.js process execution and configuration reading

import Foundation

class SyncService {
    private let projectPath: String
    private let nodePath: String
    private let npmPath: String

    static let projectPathKey = "PullReadProjectPath"

    init() {
        // Determine project path - check UserDefaults first, then auto-detect
        if let savedPath = UserDefaults.standard.string(forKey: SyncService.projectPathKey),
           FileManager.default.fileExists(atPath: "\(savedPath)/package.json") {
            projectPath = savedPath
        } else if let bundlePath = Bundle.main.resourcePath,
           FileManager.default.fileExists(atPath: "\(bundlePath)/pullread/package.json") {
            projectPath = "\(bundlePath)/pullread"
        } else {
            // Development: assume project is in parent directory of app
            let appPath = Bundle.main.bundlePath
            let parentDir = (appPath as NSString).deletingLastPathComponent
            if FileManager.default.fileExists(atPath: "\(parentDir)/package.json") {
                projectPath = parentDir
            } else {
                // Check common locations
                let home = FileManager.default.homeDirectoryForCurrentUser.path
                let commonPaths = [
                    "\(home)/Documents/pullread",
                    "\(home)/Projects/pullread",
                    "\(home)/Developer/pullread",
                    "\(home)/Code/pullread"
                ]
                projectPath = commonPaths.first { FileManager.default.fileExists(atPath: "\($0)/package.json") }
                    ?? "\(home)/Documents/pullread"  // Default for first-time setup
            }
        }

        // Find Node.js - check common locations
        let possibleNodePaths = [
            "/usr/local/bin/node",
            "/opt/homebrew/bin/node",
            "/usr/bin/node",
            "\(FileManager.default.homeDirectoryForCurrentUser.path)/.nvm/versions/node/*/bin/node"
        ]

        nodePath = possibleNodePaths.first { FileManager.default.fileExists(atPath: $0) } ?? "/usr/local/bin/node"

        let possibleNpmPaths = [
            "/usr/local/bin/npm",
            "/opt/homebrew/bin/npm",
            "/usr/bin/npm"
        ]

        npmPath = possibleNpmPaths.first { FileManager.default.fileExists(atPath: $0) } ?? "/usr/local/bin/npm"
    }

    func isNodeAvailable() -> Bool {
        return FileManager.default.fileExists(atPath: nodePath)
    }

    func getConfigPath() -> String {
        return "\(projectPath)/feeds.json"
    }

    func getProjectPath() -> String {
        return projectPath
    }

    static func setProjectPath(_ path: String) {
        UserDefaults.standard.set(path, forKey: projectPathKey)
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
        let process = Process()
        let pipe = Pipe()
        let errorPipe = Pipe()

        process.executableURL = URL(fileURLWithPath: npmPath)
        process.currentDirectoryURL = URL(fileURLWithPath: projectPath)

        if retryFailed {
            process.arguments = ["run", "sync:retry"]
        } else {
            process.arguments = ["run", "sync"]
        }

        // Set up environment with PATH including node
        var env = ProcessInfo.processInfo.environment
        let nodeBinDir = (nodePath as NSString).deletingLastPathComponent
        if let existingPath = env["PATH"] {
            env["PATH"] = "\(nodeBinDir):\(existingPath)"
        } else {
            env["PATH"] = nodeBinDir
        }
        process.environment = env

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
