package services

import cats.data.EitherT
import com.google.inject.Singleton
import connectors.GoogleBooksConnector
import models.{APIError, DataModel}

import javax.inject.Inject
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class GoogleBooksService @Inject()(connector: GoogleBooksConnector) {

  def getGoogleBook(urlOverride: Option[String]) = ???

}
