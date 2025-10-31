package controllers

import javax.inject._
import scala.concurrent.{ExecutionContext, Future}
import play.api.mvc._
import play.api.libs.json._

import services.GoogleBooksService
import models.{APIError}            // for APIError.BadAPIResponse
import models._                      // <- make sure this brings in implicit Writes/Formats for your case classes

@Singleton
class MyLibraryController @Inject()(
                                     val controllerComponents: ControllerComponents,
                                     googleBooksService: GoogleBooksService
                                   )(
                                     implicit ec: ExecutionContext
                                   ) extends BaseController {

  /** Helper: pull user's Google access token (the real Google OAuth access token)
   * This is passed from the frontend to us via Kong.
   * We use this token to call Google Books on behalf of the user.
   */
  private def extractAccessToken(request: RequestHeader): Option[String] =
    request.headers.get("X-Google-Access-Token").map(_.trim).filter(_.nonEmpty)

  /** GET /api/my-library/bookshelves
   * Returns all shelves for this user.
   * Frontend calls this with:
   *   Authorization: Bearer <idToken>           (validated by Kong OIDC)
   *   X-Google-Access-Token: <accessToken>      (we forward to Google)
   */
  def getBookshelves(): Action[AnyContent] = Action.async { implicit request =>
    extractAccessToken(request) match {
      case Some(googleAccessToken) =>
        googleBooksService.getMyBookshelves(googleAccessToken).value.map {
          case Right(bookshelvesData) =>
            // bookshelvesData is a BookshelfList model, we rely on implicit Writes in models._
            Ok(Json.toJson(bookshelvesData))

          case Left(apiError: APIError.BadAPIResponse) =>
            Status(apiError.httpResponseStatus)(
              Json.obj("error" -> apiError.reason)
            )
        }

      case None =>
        Future.successful {
          Unauthorized(
            Json.obj("error" -> "Missing X-Google-Access-Token header; cannot access Google Books.")
          )
        }
    }
  }

  /** GET /api/my-library/bookshelves/:shelfId/volumes
   * Returns the volumes (books) on a given shelf.
   * We don't try to strongly model the response yet; we just return Google's JSON.
   */
  def getShelfVolumes(shelfId: String): Action[AnyContent] = Action.async { implicit request =>
    extractAccessToken(request) match {
      case Some(googleAccessToken) =>
        googleBooksService.getShelfVolumes(googleAccessToken, shelfId).map {
          case Right(volumesJson) =>
            Ok(volumesJson)

          case Left(apiError: APIError.BadAPIResponse) =>
            Status(apiError.httpResponseStatus)(
              Json.obj("error" -> apiError.reason)
            )
        }

      case None =>
        Future.successful {
          Unauthorized(
            Json.obj("error" -> "Missing X-Google-Access-Token header; cannot access Google Books.")
          )
        }
    }
  }

  /** POST /api/my-library/bookshelves/:shelfId/add
   * Body: { "volumeId": "zyTCAlFPjgYC" }
   *
   * Adds that Google Books volumeId into this shelf.
   */
  def addToShelf(shelfId: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    extractAccessToken(request) match {
      case Some(googleAccessToken) =>
        val maybeVolumeId: Option[String] =
          (request.body \ "volumeId").asOpt[String].filter(_.nonEmpty)

        maybeVolumeId match {
          case Some(volumeId) =>
            googleBooksService.addVolumeToShelf(googleAccessToken, shelfId, volumeId).map {
              case Right(_) =>
                Ok(
                  Json.obj(
                    "status"   -> "added",
                    "shelfId"  -> shelfId,
                    "volumeId" -> volumeId
                  )
                )

              case Left(apiError: APIError.BadAPIResponse) =>
                Status(apiError.httpResponseStatus)(
                  Json.obj("error" -> apiError.reason)
                )
            }

          case None =>
            Future.successful {
              BadRequest(
                Json.obj("error" -> "Missing or empty 'volumeId' in request body.")
              )
            }
        }

      case None =>
        Future.successful {
          Unauthorized(
            Json.obj("error" -> "Missing X-Google-Access-Token header; cannot modify Google Books.")
          )
        }
    }
  }

  def removeFromShelf(shelfId: String): Action[JsValue] = Action.async(parse.json) { implicit request =>
    extractAccessToken(request) match {
      case Some(googleAccessToken) =>
        val maybeVolumeId: Option[String] =
          (request.body \ "volumeId").asOpt[String].filter(_.nonEmpty)

        maybeVolumeId match {
          case Some(volumeId) =>
            googleBooksService.removeVolumeFromShelf(googleAccessToken, shelfId, volumeId).map {
              case Right(_) =>
                Ok(Json.obj(
                  "status"   -> "removed",
                  "shelfId"  -> shelfId,
                  "volumeId" -> volumeId
                ))

              case Left(apiError: APIError.BadAPIResponse) =>
                Status(apiError.httpResponseStatus)(Json.obj("error" -> apiError.reason))
            }

          case None =>
            Future.successful(
              BadRequest(Json.obj("error" -> "Missing or empty 'volumeId' in request body."))
            )
        }

      case None =>
        Future.successful(
          Unauthorized(Json.obj("error" -> "Missing X-Google-Access-Token header; cannot modify Google Books."))
        )
    }
  }
}
