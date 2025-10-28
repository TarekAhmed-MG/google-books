package models

import play.api.libs.json.{Json, OFormat}

case class BookSummary(
                        googleId: String,
                        title: String,
                        authors: Option[Seq[String]],
                        description: Option[String],
                        pageCount: Option[Int],
                        thumbnailLink: Option[String]
                      )

object BookSummary {
  implicit val formats: OFormat[BookSummary] = Json.format[BookSummary]
}