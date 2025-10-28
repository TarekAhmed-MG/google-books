package models

import play.api.libs.json.{Json, Reads}

case class GoogleApiResponse(
                              kind: String,
                              totalItems: Int,
                              items: Option[Seq[GoogleBookItem]]
                            )

object GoogleApiResponse {
  implicit val reads: Reads[GoogleApiResponse] = Json.reads[GoogleApiResponse]
}