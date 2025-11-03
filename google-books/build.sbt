name := "google-books"
organization := "mercator"

// Image tag will be this version:
version := "1.0.1"

scalaVersion := "2.13.17"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala, DockerPlugin)
  .settings(
    // ---------------- Docker image settings ----------------
    Docker / packageName := "google-books-backend",

    // Pin a stable base to avoid digest issues
    dockerBaseImage := "eclipse-temurin:17-jre-jammy",

    // Expose Play default port
    dockerExposedPorts := Seq(9000),

    // Avoid PID file warning in containers
    javaOptions += "-Dplay.server.pidfile.path=/dev/null",

    // If/when you stop overriding dockerBuildCommand, this keeps amd64 builds via the plugin's buildx path.
    Docker / dockerBuildxPlatforms := Seq("linux/amd64"),

    // Push to Google Artifact Registry (GAR)
    Docker / dockerRepository := Some("us-central1-docker.pkg.dev/tutorial-476713/google-books"),

    // ---------------- Dependencies ----------------
    libraryDependencies ++= Seq(
      guice,
      ws,
      filters,
      "org.typelevel" %% "cats-core" % "2.13.0",
      "uk.gov.hmrc.mongo" %% "hmrc-mongo-play-29" % "1.9.0",
      "com.google.cloud" % "google-cloud-secretmanager" % "2.78.0",
      "com.google.api-client" % "google-api-client" % "2.6.0",
      "com.google.http-client" % "google-http-client-gson" % "1.43.3",
      "org.scalatest" %% "scalatest" % "3.2.19" % Test,
      "org.scalamock" %% "scalamock" % "7.5.0" % Test,
      "org.scalatestplus.play" %% "scalatestplus-play" % "7.0.2" % Test
    ),

    // HMRC resolver
    resolvers += "HMRC-open-artefacts-maven2" at "https://open.artefacts.tax.service.gov.uk/maven2"
  )
