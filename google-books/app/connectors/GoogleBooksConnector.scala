package connectors

import config.AppConfig
import play.api.Configuration
import play.api.libs.ws.{WSClient, WSResponse}
import services.AppSecrets

import javax.inject.{Inject, Singleton}
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksConnector @Inject()(
                                      ws: WSClient,
                                      appConfig: AppConfig,
                                      config: Configuration,
                                      secrets: AppSecrets
                                    )(implicit ec: ExecutionContext) {

  private val apiUrl = appConfig.googleBooksUrl
  private val apiKey = secrets.booksApiKey

  private val myLibraryBaseUrl = "https://www.googleapis.com/books/v1/mylibrary"

  // --- Existing Public Search ---
  def searchBooks(query: String): Future[WSResponse] = {
    ws.url(apiUrl)
      .withQueryStringParameters(
        "q" -> query,
        "key" -> apiKey, // This now uses the key from AppConfig
        "maxResults" -> "10",
        "orderBy" -> "relevance",
        "country" -> "GB"
      )
      .get()
  }

  // --- NEW Authenticated call for bookshelves ---
  def fetchMyBookshelves(accessToken: String): Future[WSResponse] = {
    val bookshelvesUrl = s"$myLibraryBaseUrl/bookshelves"
    ws.url(bookshelvesUrl)
      // IMPORTANT: Add the Authorization header with the user's token
      .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
      .withQueryStringParameters("country" -> "GB")
      .get() // Returns Future[WSResponse]
  }

  // --- (Optional) Add method for fetching volumes ---
  // def fetchVolumesOnShelf(accessToken: String, shelfId: String): Future[WSResponse] = {
  //   val volumesUrl = s"$myLibraryBaseUrl/bookshelves/$shelfId/volumes"
  //   ws.url(volumesUrl)
  //     .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
  //     .get()
  // }

  def fetchShelfVolumes(accessToken: String, shelfId: String): Future[WSResponse] =
    ws.url(s"https://www.googleapis.com/books/v1/mylibrary/bookshelves/$shelfId/volumes")
      .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
      .withQueryStringParameters("country" -> "GB")
      .get()

  def addVolumeToShelf(accessToken: String, shelfId: String, volumeId: String): Future[WSResponse] =
    ws.url(s"https://www.googleapis.com/books/v1/mylibrary/bookshelves/$shelfId/addVolume")
      .addQueryStringParameters("volumeId" -> volumeId, "country" -> "GB")
      .addHttpHeaders("Authorization" -> s"Bearer $accessToken")
      .post("")

  def removeVolumeFromShelf(
                             accessToken: String,
                             shelfId: String,
                             volumeId: String
                           ): Future[WSResponse] = {
    ws.url(s"https://www.googleapis.com/books/v1/mylibrary/bookshelves/$shelfId/removeVolume")
      .addHttpHeaders(
        "Authorization" -> s"Bearer $accessToken"
      )
      .withQueryStringParameters(
        "volumeId" -> volumeId,
        "country"  -> "GB"
      )
      .post("") // empty body is fine
  }
}