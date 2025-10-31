package models

import play.api.libs.json.{Json, OFormat}

case class BookshelfList(
                          kind: String,            // "books#bookshelves "
                          items: Seq[Bookshelf]    // array of Bookshelf
                        )

object BookshelfList {
  implicit val format: OFormat[BookshelfList] = Json.format[BookshelfList]
}
