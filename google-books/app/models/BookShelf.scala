// models/Bookshelf.scala
package models

import play.api.libs.json.{Json, Reads}

case class Bookshelf(
                      kind: String,
                      id: Int, // Or String depending on API
                      selfLink: String,
                      title: String,
                      access: String,
                      updated: String, // Consider using a date/time type
                      created: String, // Consider using a date/time type
                      volumeCount: Int,
                      volumesLastUpdated: String // Consider using a date/time type
                    )

object Bookshelf {
  implicit val reads: Reads[Bookshelf] = Json.reads[Bookshelf]
}

// models/BookshelfList.scala
package models

import play.api.libs.json.{Json, Reads}

case class BookshelfList(
                          kind: String,
                          items: Seq[Bookshelf] // Assuming the API returns a list under "items"
                        )

object BookshelfList {
  implicit val reads: Reads[BookshelfList] = Json.reads[BookshelfList]
}

// You would similarly define models for VolumeList and Volume if needed