package models

import play.api.libs.json.{Json, OFormat} // Make sure OFormat is imported

case class BookshelfList(
                          kind: String,
                          items: Seq[Bookshelf] // This depends on the Bookshelf format above
                        )

object BookshelfList {
  // **Crucial:** Ensure this implicit format is defined in the companion object
  // This line tells Play how to convert BookshelfList to/from JSON.
  // It automatically uses the implicit format defined in the Bookshelf object for the 'items' field.
  implicit val format: OFormat[BookshelfList] = Json.format[BookshelfList]
}