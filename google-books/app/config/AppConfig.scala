package config // New package name

import com.google.cloud.secretmanager.v1.{SecretManagerServiceClient, SecretVersionName}
import play.api.Configuration
import javax.inject.{Inject, Singleton}

@Singleton
class AppConfig @Inject()(playConfig: Configuration) {

  private val projectId: String = playConfig.get[String]("google.cloud.project")

  // --- Auth ---
  lazy val googleClientId: String = playConfig.get[String]("google.auth.clientId")
  lazy val googleClientSecret: String = fetchSecret("google-client-secret")
  lazy val googleRedirectUri: String = playConfig.getOptional[String]("GOOGLE_REDIRECT_URI") // Read from ENV
    .orElse(playConfig.getOptional[String]("google.auth.redirectUri")) // Fallback to conf
    .getOrElse("http://localhost:3000")
  lazy val googleTokenUri: String = playConfig.get[String]("google.auth.tokenUri")

  // --- Books API ---
  lazy val googleBooksUrl: String = playConfig.get[String]("google.books.url")
  lazy val googleBooksApiKey: String = fetchSecret("google-books-api-key")

  private def fetchSecret(secretId: String, versionId: String = "latest"): String = {
    try {
      // Workload Identity provides credentials automatically in GKE
      val client: SecretManagerServiceClient = SecretManagerServiceClient.create()
      try {
        val secretVersionName = SecretVersionName.of(projectId, secretId, versionId)
        val response = client.accessSecretVersion(secretVersionName)
        response.getPayload.getData.toStringUtf8
      } finally {
        client.close()
      }
    } catch {
      case e: Exception =>
        throw new RuntimeException(s"Failed to fetch secret '$secretId' from project '$projectId': ${e.getMessage}", e)
    }
  }
}