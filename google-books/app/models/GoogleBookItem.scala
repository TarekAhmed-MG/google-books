package models

import play.api.libs.json.{Json, OFormat, Reads}

case class GoogleBookItem(
                           id: String,
                           volumeInfo: VolumeInfo
                         ) {

  val bookSummary: BookSummary = BookSummary(
    googleId = id,
    title = volumeInfo.title,
    authors = volumeInfo.authors,
    description = volumeInfo.description,
    pageCount = volumeInfo.pageCount,
    thumbnailLink = volumeInfo.imageLinks.flatMap(_.thumbnail)
  )
}

object GoogleBookItem {
  implicit val reads: Reads[GoogleBookItem] = Json.reads[GoogleBookItem]
}