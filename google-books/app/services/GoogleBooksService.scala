package services

import cats.data.EitherT
import connectors.GoogleBooksConnector
import models.{APIError, BookSummary, GoogleApiResponse}
import play.api.http.Status._
import play.api.libs.json._

import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksService @Inject()(connector: GoogleBooksConnector)(implicit ec: ExecutionContext) {

  // Define Reads for the top-level response structure
  implicit val responseReads: Reads[GoogleApiResponse] = GoogleApiResponse.reads

  type FutureEither[A] = EitherT[Future, APIError, A]

  def getGoogleBook(search: String, term: String): FutureEither[Seq[BookSummary]] = {
    val query = if (term.toLowerCase == "general") search else s"$term:$search"

    EitherT(connector.searchBooks(query).map { response =>
      response.status match {
        case OK =>
          // Try to parse the whole GoogleApiResponse
          response.json.validate[GoogleApiResponse] match {
            // Successfully parsed and items exist
            case JsSuccess(apiResponse, _) if apiResponse.items.exists(_.nonEmpty) =>
              // Extract items, map to BookSummary, handle potential None for items
              Right(apiResponse.items.getOrElse(Seq.empty).map(_.bookSummary))

            // Successfully parsed but totalItems is 0 or items array is empty/missing
            case JsSuccess(apiResponse, _) =>
              Left(APIError.BadAPIResponse(NOT_FOUND, s"No books found for query: '$query'"))

            // Failed to parse the expected JSON structure
            case JsError(errors) =>
              Left(APIError.BadAPIResponse(INTERNAL_SERVER_ERROR, s"Failed to parse Google API JSON response: ${errors.toString}"))
          }
        // Handle non-OK status codes from Google
        case status =>
          val upstreamError = (response.json \ "error" \ "message").asOpt[String].getOrElse("Unknown error from Google API")
          Left(APIError.BadAPIResponse(status, upstreamError))
      }
    }.recover { // Handle network failures
      case e: Exception => Left(APIError.BadAPIResponse(SERVICE_UNAVAILABLE, s"Could not connect to Google Books API: ${e.getMessage}"))
    })
  }
}