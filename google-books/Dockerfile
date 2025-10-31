# --- Stage 1: Build ---
# Pick a tag that matches your toolchain:
# <jdk>_<sbt>_<scala>
# e.g. eclipse-temurin-17.0.13_11_1.10.7_2.13.12 (adjust Scala to your project)
ARG SBT_SCALA_TAG=eclipse-temurin-17.0.13_11_1.10.7_2.13.12
FROM sbtscala/scala-sbt:${SBT_SCALA_TAG} AS builder

WORKDIR /app

# Dependency caching
COPY project ./project
COPY build.sbt .
# (Remove this next line if you don't use Mill)
# COPY build.sc .

# Copy the rest
COPY . .

# Non-interactive + faster builds
RUN sbt -batch update stage

# --- Stage 2: Run ---
FROM eclipse-temurin:17-jre
WORKDIR /app

# Copy the staged app
COPY --from=builder /app/target/universal/stage .

EXPOSE 9000
ENTRYPOINT ["./bin/google-books", "-Dplay.server.pidfile.path=/dev/null"]
