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

  // Read config values directly in the connector
  private val apiUrl = config.get[String]("google.books.url")
  private val apiKey = config.get[String]("google.books.apiKey")

  def searchBooks(query: String): Future[WSResponse] = {
    ws.url(apiUrl)
      .withQueryStringParameters(
        "q" -> query,
        "key" -> apiKey,
        "maxResults" -> "10", // Limit results for now
        "orderBy" -> "relevance"
      )
      .get() // Returns Future[WSResponse]
  }
}