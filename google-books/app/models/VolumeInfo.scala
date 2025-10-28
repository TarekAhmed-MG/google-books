package models

import play.api.libs.json.{Json, OFormat, Reads} // Added Reads

case class ImageLinks(
                       smallThumbnail: Option[String],
                       thumbnail: Option[String]
                     )

object ImageLinks {
  implicit val reads: Reads[ImageLinks] = Json.reads[ImageLinks]
}

case class VolumeInfo(
                       title: String,
                       authors: Option[Seq[String]], // Added
                       publisher: Option[String], // Added
                       publishedDate: Option[String], // Added
                       description: Option[String],
                       pageCount: Option[Int],
                       imageLinks: Option[ImageLinks] // Added
                     )

object VolumeInfo{
  implicit val reads: Reads[VolumeInfo] = Json.reads[VolumeInfo]
}