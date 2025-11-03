package services

import config.AppConfig
import com.google.api.client.googleapis.auth.oauth2.{GoogleIdToken, GoogleIdTokenVerifier}
import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory

import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._
import scala.util.Try

@Singleton
class GoogleTokenValidator @Inject()(
                                      appConfig: AppConfig
                                    )(implicit ec: ExecutionContext) {

  private val transport = new NetHttpTransport()
  private val jsonFactory = GsonFactory.getDefaultInstance()

  private val verifier: GoogleIdTokenVerifier =
    new GoogleIdTokenVerifier.Builder(transport, jsonFactory)
      .setAudience(List(appConfig.googleClientId).asJava)
      // Google can issue either of these; accept both:
      .setIssuers(List("https://accounts.google.com", "accounts.google.com").asJava)
      .build()

  /** Validates a Google ID token. */
  def validate(token: String): Future[Try[GoogleIdToken.Payload]] =
    Future {
      Try {
        val idToken = verifier.verify(token)
        if (idToken == null) throw new SecurityException("Invalid ID token: verification failed.")
        idToken.getPayload
      }
    }
}
