package controllers

import play.api.libs.json.Json
import play.api.mvc.{Action, AnyContent, BaseController, ControllerComponents}
import services.GoogleBooksService

import javax.inject.{Inject, Singleton}
import scala.concurrent.ExecutionContext

@Singleton
class GoogleBooksController @Inject()(
                                       val controllerComponents: ControllerComponents,
                                       val googleBooksService: GoogleBooksService
                                     )(implicit val ec: ExecutionContext)
  extends BaseController
    with play.api.i18n.I18nSupport {

  def getGoogleBook(search: String, term: String): Action[AnyContent] = Action.async { implicit request =>
    googleBooksService.getGoogleBook(search = search, term = term).value.map {

      case Right(bookSummaries) =>
        Ok(Json.toJson(bookSummaries))

      case Left(apiError) =>
        Status(apiError.httpResponseStatus)(Json.obj("error" -> apiError.reason))
    }
  }
}