// Play 3 plugin (keep your version)
addSbtPlugin("org.playframework" % "sbt-plugin" % "3.0.9")

// Use the current native-packager (1.11.1 as of now)
addSbtPlugin("com.github.sbt" % "sbt-native-packager" % "1.11.1")

// Make sure the SBT plugin repo is explicitly available
resolvers += "Sbt Plugin Releases" at "https://repo.scala-sbt.org/scalasbt/sbt-plugin-releases"

// (Remove legacy resolvers like Typesafe Releases here)

