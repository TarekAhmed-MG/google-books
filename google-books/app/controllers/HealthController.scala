package controllers

import javax.inject._
import play.api.mvc._

@Singleton
class HealthController @Inject()(cc: ControllerComponents) extends AbstractController(cc) {
  def health: Action[AnyContent] = Action(Ok("OK"))
}
