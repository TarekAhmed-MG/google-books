package controllers

import config.AppConfig
import services.GoogleTokenValidator
import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken.Payload

import javax.inject._
import play.api._
import play.api.mvc._
import play.api.libs.ws._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Try, Success, Failure}

// --- Keep CodeRequest as-is ---
case class CodeRequest(code: String)
object CodeRequest {
  implicit val reads: Reads[CodeRequest] = Json.reads[CodeRequest]
}

// --- UserInfo with safer extraction ---
case class UserInfo(
                     sub: String,
                     email: String,
                     name: String,
                     picture: Option[String],
                     given_name: Option[String],
                     family_name: Option[String],
                     email_verified: Option[Boolean]
                   )
object UserInfo {
  implicit val format: OFormat[UserInfo] = Json.format[UserInfo]

  private def asString(opt: Any): Option[String] = opt match {
    case s: String => Option(s)
    case _         => None
  }
  private def asBool(opt: Any): Option[Boolean] = opt match {
    case b: java.lang.Boolean => Option(b.booleanValue())
    case b: Boolean           => Option(b)
    case _                    => None
  }

  def fromGooglePayload(payload: Payload): UserInfo = {
    UserInfo(
      sub           = payload.getSubject,
      email         = payload.getEmail,                              // Google guarantees string here
      email_verified= asBool(payload.getEmailVerified),
      name          = asString(payload.get("name")).getOrElse(""),
      picture       = asString(payload.get("picture")),
      given_name    = asString(payload.get("given_name")),
      family_name   = asString(payload.get("family_name"))
    )
  }
}

@Singleton
class AuthController @Inject()(
                                val controllerComponents: ControllerComponents,
                                ws: WSClient,
                                appConfig: AppConfig,
                                secrets: services.AppSecrets,
                                config: Configuration,
                                googleTokenValidator: GoogleTokenValidator
                              )(implicit ec: ExecutionContext) extends BaseController {

  private val clientId     = appConfig.googleClientId
  private val clientSecret = secrets.oauthSecret
  private val redirectUri  = appConfig.googleRedirectUri
  private val tokenUri     = appConfig.googleTokenUri

  def exchangeCode(): Action[JsValue] = Action.async(parse.json) { implicit request =>
    request.body.validate[CodeRequest].fold(
      errors => Future.successful(
        BadRequest(Json.obj("error" -> "Invalid request body", "details" -> JsError.toJson(errors)))
      ),
      codeRequest => {
        Logger(getClass).info(s"Attempting to exchange code: ${codeRequest.code.take(10)}...")

        val tokenParams = Map(
          "code"          -> Seq(codeRequest.code),
          "client_id"     -> Seq(clientId),
          "client_secret" -> Seq(clientSecret),
          "redirect_uri"  -> Seq(redirectUri),
          "grant_type"    -> Seq("authorization_code")
        )

        ws.url(tokenUri)
          .post(tokenParams) // application/x-www-form-urlencoded
          .flatMap { response =>
            response.status match {
              case OK =>
                Logger(getClass).info("Successfully exchanged code for tokens.")
                val accessTokenOpt = (response.json \ "access_token").asOpt[String]
                val idTokenOpt     = (response.json \ "id_token").asOpt[String]
                val expiresInOpt   = (response.json \ "expires_in").asOpt[Int]

                (accessTokenOpt, idTokenOpt, expiresInOpt) match {
                  case (Some(accessToken), Some(idToken), Some(expiresIn)) =>
                    googleTokenValidator.validate(idToken).map {
                      case Success(payload: Payload) =>
                        val userInfo = UserInfo.fromGooglePayload(payload)
                        Logger(getClass).info(s"ID Token validated for user: ${userInfo.email}")
                        Ok(Json.obj(
                          "access_token" -> accessToken,
                          "id_token"     -> idToken,
                          "user_info"    -> Json.toJson(userInfo),
                          "expires_in"   -> expiresIn
                        ))

                      case Failure(ex) =>
                        Logger(getClass).error(s"Invalid ID token received from Google: ${ex.getMessage}")
                        Unauthorized(Json.obj("error" -> "Invalid ID token", "details" -> ex.getMessage))
                    }

                  case _ =>
                    Logger(getClass).error(s"Missing required fields in Google token response: ${response.body}")
                    Future.successful(InternalServerError(Json.obj("error" -> "Incomplete token response from Google")))
                }

              case status =>
                Logger(getClass).error(s"Failed to exchange code. Google responded with status $status: ${response.body}")
                val errorDescription =
                  (response.json \ "error_description").asOpt[String].getOrElse("Unknown error during code exchange.")
                Future.successful(Status(status)(Json.obj("error" -> s"Google token exchange failed: $errorDescription")))
            }
          }
          .recover {
            case e: Exception =>
              Logger(getClass).error(s"Exception during code exchange request: ${e.getMessage}", e)
              InternalServerError(Json.obj("error" -> s"Failed to connect to Google token endpoint: ${e.getMessage}"))
          }
      }
    )
  }
}
