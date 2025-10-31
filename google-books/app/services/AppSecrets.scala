package services

import play.api.Configuration
import javax.inject.{Inject, Singleton}
import utils.SecretManager

@Singleton
class AppSecrets @Inject()(config: Configuration) {
  private val booksApiKeyPath  = config.get[String]("google.secrets.booksApiKey")
  private val oauthSecretPath  = config.get[String]("google.secrets.oauthClientSecret")

  lazy val booksApiKey: String = SecretManager.access(booksApiKeyPath)
  lazy val oauthSecret: String = SecretManager.access(oauthSecretPath)
}
