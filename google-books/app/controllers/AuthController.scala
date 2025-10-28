package controllers

import javax.inject._
import play.api._
import play.api.mvc._
import play.api.libs.ws._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}
// No pdi-jwt import needed
import java.util.Base64 // <-- Import Java Base64
import scala.util.{Try, Success, Failure} // Keep Try import

// --- Keep CodeRequest case class ---
case class CodeRequest(code: String)
object CodeRequest {
  implicit val reads: Reads[CodeRequest] = Json.reads[CodeRequest]
}

// --- Keep UserInfo case class ---
case class UserInfo(
                     sub: String, email: String, name: String, picture: Option[String],
                     given_name: Option[String], family_name: Option[String], email_verified: Option[Boolean]
                   )
object UserInfo {
  implicit val format: OFormat[UserInfo] = Json.format[UserInfo]
}


@Singleton
class AuthController @Inject()(
                                val controllerComponents: ControllerComponents,
                                ws: WSClient,
                                config: Configuration
                              )(implicit ec: ExecutionContext) extends BaseController {

  private val clientId = config.get[String]("google.auth.clientId")
  private val clientSecret = config.get[String]("google.auth.clientSecret")
  private val redirectUri = config.get[String]("google.auth.redirectUri")
  private val tokenUri = config.get[String]("google.auth.tokenUri")

  // Helper to decode Base64 URL encoded string
  private def base64UrlDecode(encoded: String): Try[String] = Try {
    // Replace URL-safe characters and add padding if necessary
    val correctedEncoding = encoded.replace('-', '+').replace('_', '/')
    val padding = (4 - correctedEncoding.length % 4) % 4
    val paddedEncoding = correctedEncoding + ("=" * padding)
    new String(Base64.getDecoder.decode(paddedEncoding), "UTF-8")
  }

  def exchangeCode(): Action[JsValue] = Action.async(parse.json) { implicit request =>
    request.body.validate[CodeRequest].fold(
      errors => {
        Future.successful(BadRequest(Json.obj("error" -> "Invalid request body", "details" -> JsError.toJson(errors))))
      },
      codeRequest => {
        Logger(getClass).info(s"Attempting to exchange code: ${codeRequest.code.take(10)}...")

        val tokenParams = Map(
          "code" -> Seq(codeRequest.code),
          "client_id" -> Seq(clientId),
          "client_secret" -> Seq(clientSecret),
          "redirect_uri" -> Seq(redirectUri),
          "grant_type" -> Seq("authorization_code")
        )

        ws.url(tokenUri)
          .post(tokenParams)
          .flatMap { response =>
            response.status match {
              case OK =>
                Logger(getClass).info("Successfully exchanged code for tokens.")
                val accessTokenOpt = (response.json \ "access_token").asOpt[String]
                val idTokenOpt = (response.json \ "id_token").asOpt[String]
                val expiresInOpt = (response.json \ "expires_in").asOpt[Int]

                (accessTokenOpt, idTokenOpt, expiresInOpt) match {
                  case (Some(accessToken), Some(idToken), Some(expiresIn)) =>

                    // --- Generic JWT Payload Decoding ---
                    val payloadPart = idToken.split('.').lift(1) // Get the middle part (payload)

                    payloadPart.map(base64UrlDecode) match {
                      case Some(Success(decodedPayloadJsonString)) =>
                        // Parse the decoded JSON string
                        Try(Json.parse(decodedPayloadJsonString)) match {
                          case Success(jsonPayload) =>
                            Logger(getClass).info(s"ID Token decoded for user: ${(jsonPayload \ "email").asOpt[String]}")
                            // Extract user info
                            val userInfo = UserInfo(
                              sub = (jsonPayload \ "sub").as[String],
                              email = (jsonPayload \ "email").as[String],
                              name = (jsonPayload \ "name").asOpt[String].getOrElse(""),
                              picture = (jsonPayload \ "picture").asOpt[String],
                              given_name = (jsonPayload \ "given_name").asOpt[String],
                              family_name = (jsonPayload \ "family_name").asOpt[String],
                              email_verified = (jsonPayload \ "email_verified").asOpt[Boolean]
                            )

                            Future.successful(Ok(Json.obj(
                              "access_token" -> accessToken,
                              "id_token" -> idToken,
                              "user_info" -> Json.toJson(userInfo),
                              "expires_in" -> expiresIn
                            )))

                          case Failure(jsonEx) =>
                            Logger(getClass).error(s"Failed to parse JSON content of ID token payload: ${jsonEx.getMessage}")
                            Future.successful(InternalServerError(Json.obj("error" -> "Failed to parse ID token claims")))
                        }

                      case Some(Failure(base64Ex)) =>
                        Logger(getClass).error(s"Failed to Base64 decode ID token payload: ${base64Ex.getMessage}")
                        Future.successful(InternalServerError(Json.obj("error" -> "Invalid ID token encoding")))

                      case None =>
                        Logger(getClass).error(s"Invalid ID token structure: Missing payload part.")
                        Future.successful(InternalServerError(Json.obj("error" -> "Invalid ID token structure")))
                    }
                  // --- End Generic Decoding ---

                  case _ =>
                    Logger(getClass).error(s"Missing required fields in Google token response: ${response.body}")
                    Future.successful(InternalServerError(Json.obj("error" -> "Incomplete token response from Google")))
                }
              case status =>
                Logger(getClass).error(s"Failed to exchange code. Google responded with status $status: ${response.body}")
                val errorDescription = (response.json \ "error_description").asOpt[String].getOrElse("Unknown error during code exchange.")
                Future.successful(Status(status)(Json.obj("error" -> s"Google token exchange failed: $errorDescription")))
            }
          }
          .recover { // Handle WSClient failures
            case e: Exception =>
              Logger(getClass).error(s"Exception during code exchange request: ${e.getMessage}", e)
              InternalServerError(Json.obj("error" -> s"Failed to connect to Google token endpoint: ${e.getMessage}"))
          }
      }
    )
  }
}