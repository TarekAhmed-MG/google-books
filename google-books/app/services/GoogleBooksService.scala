package services

import cats.data.EitherT
import connectors.GoogleBooksConnector
import models.{APIError, BookSummary, GoogleApiResponse, BookshelfList, Bookshelf}
import play.api.http.Status._
import play.api.libs.json._

import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksService @Inject()(
                                    connector: GoogleBooksConnector
                                  )(implicit ec: ExecutionContext) {

  // Your existing implicit Reads
  implicit val responseReads: Reads[GoogleApiResponse] = GoogleApiResponse.reads

  // Make sure your Bookshelf / BookshelfList case classes use Option[...] for fields that might be missing
  implicit val bookshelfReads: Reads[Bookshelf] = Json.reads[Bookshelf]
  implicit val bookshelfListReads: Reads[BookshelfList] = Json.reads[BookshelfList]

  // Type alias helper
  type FutureEither[A] = EitherT[Future, APIError, A]

  // ---------------------------------
  // 1. Public search (already had)
  // ---------------------------------
  def getGoogleBook(search: String, term: String): FutureEither[Seq[BookSummary]] = {
    val query =
      if (term.toLowerCase == "general") search
      else s"$term:$search"

    EitherT(
      connector.searchBooks(query).map { response =>
        response.status match {
          case OK =>
            response.json.validate[GoogleApiResponse] match {
              case JsSuccess(apiResponse, _)
                if apiResponse.items.exists(_.nonEmpty) =>
                Right(apiResponse.items.getOrElse(Seq.empty).map(_.bookSummary))

              case JsSuccess(_, _) =>
                Left(APIError.BadAPIResponse(NOT_FOUND, s"No books found for query: '$query'"))

              case JsError(errors) =>
                Left(APIError.BadAPIResponse(
                  INTERNAL_SERVER_ERROR,
                  s"Failed to parse Google API JSON response: ${errors.toString}"
                ))
            }

          case status =>
            val upstreamError =
              (response.json \ "error" \ "message").asOpt[String]
                .getOrElse("Unknown error from Google API")
            Left(APIError.BadAPIResponse(status, upstreamError))
        }
      }.recover {
        case e: Exception =>
          Left(APIError.BadAPIResponse(
            SERVICE_UNAVAILABLE,
            s"Could not connect to Google Books API: ${e.getMessage}"
          ))
      }
    )
  }

  // ---------------------------------
  // 2. User shelves (already had)
  // ---------------------------------
  def getMyBookshelves(accessToken: String): FutureEither[BookshelfList] = {
    EitherT(
      connector.fetchMyBookshelves(accessToken).map { response =>
        response.status match {
          case OK =>
            response.json.validate[BookshelfList] match {
              case JsSuccess(bookshelfData, _) =>
                Right(bookshelfData)

              case JsError(errors) =>
                Left(APIError.BadAPIResponse(
                  INTERNAL_SERVER_ERROR,
                  s"Failed to parse Google Mylibrary JSON response: ${errors.toString}"
                ))
            }

          case UNAUTHORIZED | FORBIDDEN =>
            val upstreamError =
              (response.json \ "error" \ "message").asOpt[String]
                .getOrElse("Token is invalid or expired.")
            Left(APIError.BadAPIResponse(response.status, upstreamError))

          case status =>
            val upstreamError =
              (response.json \ "error" \ "message").asOpt[String]
                .getOrElse("Unknown error from Google Mylibrary API")
            Left(APIError.BadAPIResponse(status, upstreamError))
        }
      }.recover {
        case e: Exception =>
          Left(APIError.BadAPIResponse(
            SERVICE_UNAVAILABLE,
            s"Could not connect to Google Books Mylibrary API: ${e.getMessage}"
          ))
      }
    )
  }

  // ---------------------------------
  // 3. NEW: Get volumes for one shelf
  // ---------------------------------
  // Google endpoint:
  // GET https://www.googleapis.com/books/v1/mylibrary/bookshelves/{shelfId}/volumes
  //
  // We are not forcing a strict case class here yet, we'll just return the raw JsValue
  // because Google returns a big "volumeInfo" tree and you mostly render it directly.
  def getShelfVolumes(accessToken: String, shelfId: String)
  : Future[Either[APIError.BadAPIResponse, JsValue]] = {

    connector.fetchShelfVolumes(accessToken, shelfId).map { response =>
      response.status match {
        case OK =>
          // Pass Google's JSON directly back up
          Right(response.json)

        case UNAUTHORIZED | FORBIDDEN =>
          Left(APIError.BadAPIResponse(
            response.status,
            "Token is invalid or expired."
          ))

        case status =>
          val upstreamError =
            (response.json \ "error" \ "message").asOpt[String]
              .getOrElse("Error fetching shelf volumes.")
          Left(APIError.BadAPIResponse(status, upstreamError))
      }
    }.recover {
      case e: Exception =>
        Left(APIError.BadAPIResponse(
          SERVICE_UNAVAILABLE,
          s"Could not connect to Google Books Shelf Volumes API: ${e.getMessage}"
        ))
    }
  }

  // ---------------------------------
  // 4. NEW: Add a volume to a shelf
  // ---------------------------------
  // Google endpoint:
  // POST https://www.googleapis.com/books/v1/mylibrary/bookshelves/{shelfId}/addVolume?volumeId=abc123
  //
  // Returns 204 No Content on success.
  def addVolumeToShelf(
                        accessToken: String,
                        shelfId: String,
                        volumeId: String
                      ): Future[Either[APIError.BadAPIResponse, Unit]] = {

    connector.addVolumeToShelf(accessToken, shelfId, volumeId).map { response =>
      response.status match {
        case OK | NO_CONTENT =>
          Right(())

        case UNAUTHORIZED =>
          Left(APIError.BadAPIResponse(
            response.status,
            "Access token is missing or expired."
          ))

        case FORBIDDEN =>
          Left(APIError.BadAPIResponse(
            response.status,
            "Google refused to add this book. The shelf may be read-only or the book is already on that shelf."
          ))

        case status =>
          val upstreamError =
            (response.json \ "error" \ "message").asOpt[String]
              .getOrElse("Error adding volume to shelf.")
          Left(APIError.BadAPIResponse(status, upstreamError))
      }
    }.recover {
      case e: Exception =>
        Left(APIError.BadAPIResponse(
          SERVICE_UNAVAILABLE,
          s"Could not connect to Google Books Add Volume API: ${e.getMessage}"
        ))
    }
  }



  //// REMOVE BOOK SERVICE

  def removeVolumeFromShelf(
                             accessToken: String,
                             shelfId: String,
                             volumeId: String
                           ): Future[Either[APIError.BadAPIResponse, Unit]] = {

    connector.removeVolumeFromShelf(accessToken, shelfId, volumeId).map { response =>
      response.status match {
        case OK | NO_CONTENT =>
          Right(())

        case UNAUTHORIZED | FORBIDDEN =>
          Left(APIError.BadAPIResponse(
            response.status,
            "Token is invalid or expired."
          ))

        case status =>
          val upstreamError =
            (response.json \ "error" \ "message").asOpt[String]
              .getOrElse("Error removing volume from shelf.")
          Left(APIError.BadAPIResponse(status, upstreamError))
      }
    }.recover {
      case e: Exception =>
        Left(APIError.BadAPIResponse(
          SERVICE_UNAVAILABLE,
          s"Could not connect to Google Books Remove Volume API: ${e.getMessage}"
        ))
    }
  }

}
