package connectors

import play.api.Configuration
import play.api.libs.ws.{WSClient, WSResponse}
import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksConnector @Inject()(
                                      ws: WSClient,
                                      config: Configuration
                                    )(implicit ec: ExecutionContext) {

  private val apiUrl = config.get[String]("google.books.url") //
  private val apiKey = config.get[String]("google.books.apiKey") //

  // Base URL for authenticated calls might be different or use the same + /mylibrary path
  private val myLibraryBaseUrl = "https://www.googleapis.com/books/v1/mylibrary" // Adjust if needed

  // --- Existing Public Search ---
  def searchBooks(query: String): Future[WSResponse] = { //
    ws.url(apiUrl)
      .withQueryStringParameters(
        "q" -> query,
        "key" -> apiKey,
        "maxResults" -> "10",
        "orderBy" -> "relevance"
      )
      .get() //
  }

  // --- NEW Authenticated call for bookshelves ---
  def fetchMyBookshelves(accessToken: String): Future[WSResponse] = {
    val bookshelvesUrl = s"$myLibraryBaseUrl/bookshelves"
    ws.url(bookshelvesUrl)
      // IMPORTANT: Add the Authorization header with the user's token
      .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
      .get() // Returns Future[WSResponse]
  }

  // --- (Optional) Add method for fetching volumes ---
  // def fetchVolumesOnShelf(accessToken: String, shelfId: String): Future[WSResponse] = {
  //   val volumesUrl = s"$myLibraryBaseUrl/bookshelves/$shelfId/volumes"
  //   ws.url(volumesUrl)
  //     .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
  //     .get()
  // }
}