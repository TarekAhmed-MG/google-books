package controllers

import play.api.libs.json.Json
import play.api.mvc.{Action, AnyContent, BaseController, ControllerComponents}
import services.GoogleBooksService

import javax.inject._
import scala.concurrent.{ExecutionContext, Future}

@Singleton
class MyLibraryController @Inject()(
                                     val controllerComponents: ControllerComponents,
                                     googleBooksService: GoogleBooksService
                                   )
                                   (implicit ec: ExecutionContext)
  extends BaseController{

  def getBookshelves() = Action.async{

    def getBookshelves(): Action[AnyContent] = Action.async { implicit request =>
      // Extract the Access Token passed from Kong (or frontend via Kong)
      val accessTokenOpt: Option[String] = request.headers.get("Authorization")
        .filter(_.startsWith("Bearer "))
        .map(_.drop(7)) // Remove "Bearer " prefix

      accessTokenOpt match {
        case Some(token) =>
          // Call the service method to fetch bookshelves using the token
          googleBooksService.getMyBookshelves(token).value.map { // .value unwraps the EitherT
            case Right(bookshelvesData) =>
              // Successfully fetched data, return it as JSON
              Ok(Json.toJson(bookshelvesData)) // Assuming BookshelfData is serializable to JSON

            case Left(apiError) =>
              // An error occurred (e.g., token invalid, Google API error)
              Status(apiError.httpResponseStatus)(Json.obj("error" -> apiError.reason))
          }
        case None =>
          // This *shouldn't* happen if Kong's OIDC plugin is correctly configured and enforced
          // But handle defensively. Kong should ideally block unauthorized requests.
          Future.successful(Unauthorized(Json.obj("error" -> "Authorization token is missing or invalid.")))
      }
    }

  }

  // --- (Optional) Action to get volumes on a specific shelf ---
  // def getVolumesOnShelf(shelfId: String): Action[AnyContent] = Action.async { implicit request =>
  //   val accessTokenOpt: Option[String] = request.headers.get("Authorization") // ... extract token ...
  //   accessTokenOpt match {
  //     case Some(token) =>
  //       // Call service method: googleBooksService.getVolumesForShelf(token, shelfId).value.map { ... }
  //       Future.successful(NotImplemented("Endpoint not yet implemented")) // Placeholder
  //     case None =>
  //       Future.successful(Unauthorized(Json.obj("error" -> "Authorization token is missing or invalid.")))
  //   }
  // }


}
