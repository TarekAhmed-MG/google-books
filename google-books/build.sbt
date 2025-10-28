name := "google-books"
organization := "mercator"
version := "1.0-SNAPSHOT"

scalaVersion := "2.13.17"

lazy val root = (project in file("."))
  .enablePlugins(PlayScala)
  .settings(
    libraryDependencies ++= Seq(
      guice,
      ws,
      filters,
      "org.typelevel" %% "cats-core" % "2.13.0",
      // HMRC mongo compatible with Play 2.9:
      "uk.gov.hmrc.mongo" %% "hmrc-mongo-play-29" % "1.9.0",
      // Testing
      "org.scalatest"          %% "scalatest"         % "3.2.19" % Test,
      "org.scalamock"          %% "scalamock"         % "6.0.0"  % Test,
      "org.scalatestplus.play" %% "scalatestplus-play" % "7.0.2"  % Test
    ),
    resolvers += "HMRC-open-artefacts-maven2" at "https://open.artefacts.tax.service.gov.uk/maven2"
  )
