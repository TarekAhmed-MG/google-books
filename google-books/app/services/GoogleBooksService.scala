package services

import cats.data.EitherT
import com.google.inject.Singleton
import connectors.GoogleBooksConnector
import models.{APIError, DataModel}

import javax.inject.Inject
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksService @Inject()(connector: GoogleBooksConnector) {

  def getGoogleBook(urlOverride: Option[String] = None, search: String, term: String)(implicit ec: ExecutionContext):EitherT[Future, APIError, DataModel] =
    connector.get[DataModel](urlOverride.getOrElse(s"https://www.googleapis.com/books/v1/volumes?q=$search%$term"))

}
