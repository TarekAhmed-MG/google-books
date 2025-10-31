package controllers

import javax.inject._
import scala.concurrent.{ExecutionContext, Future}

import play.api.mvc._
import play.api.libs.json._

import services.GoogleBooksService
import models.APIError // assuming you already have this in scope somewhere

@Singleton
class MyLibraryController @Inject()(
                                     val controllerComponents: ControllerComponents,
                                     googleBooksService: GoogleBooksService
                                   )(
                                     implicit ec: ExecutionContext
                                   ) extends BaseController {

  /**
   * GET /api/my-library/bookshelves
   *
   * Flow:
   * - Browser -> Kong:
   *     Authorization: Bearer <id_token>
   *     X-Google-Access-Token: <access_token>
   *
   * - Kong:
   *     - validates the id_token via openid-connect plugin (OIDC)
   *     - if valid, proxies request to THIS controller
   *
   * - Backend (this controller):
   *     - extracts X-Google-Access-Token (the real Google OAuth access token)
   *     - calls Google Books API on behalf of the user
   *     - returns shelves JSON back to the browser
   */
  def getBookshelves(): Action[AnyContent] = Action.async { implicit request =>
    // IMPORTANT:
    // Do NOT trust request.headers.get("Authorization") here for Google.
    // That header is the ID TOKEN (validated already by Kong).
    //
    // We need the opaque Google access token, which the frontend sent in:
    //   X-Google-Access-Token: <access_token>
    val googleAccessTokenOpt: Option[String] =
      request.headers.get("X-Google-Access-Token").map(_.trim).filter(_.nonEmpty)

    googleAccessTokenOpt match {
      case Some(googleAccessToken) =>
        // Ask our service to fetch shelves from Google using the user's access token.
        googleBooksService.getMyBookshelves(googleAccessToken).value.map {
          case Right(bookshelvesData) =>
            // Happy path: return Google's data to the frontend
            Ok(Json.toJson(bookshelvesData))

          case Left(apiError) =>
            // Could be:
            // - Google said 401/403 (expired or invalid access token)
            // - parse error
            // - upstream network issue
            Status(apiError.httpResponseStatus)(
              Json.obj("error" -> apiError.reason)
            )
        }

      case None =>
        // Kong let them through (OIDC passed), but they didn't include or lost
        // the Google access token that authorises us to hit Google Books.
        Future.successful(
          Unauthorized(
            Json.obj(
              "error" -> "Missing X-Google-Access-Token header; cannot access Google Books."
            )
          )
        )
    }
  }

  // If you later add:
  // GET /api/my-library/bookshelves/:shelfId/volumes
  // you will follow the same pattern:
  //   - extract X-Google-Access-Token
  //   - call Google with that token
  //   - pipe back results
}
