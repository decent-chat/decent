'use strict'

const items = ['a', 'b', 'c']

const activeItemIndex = new Value(0)
const activeItem = new Reference(items, activeItemIndex)

activeItem.onChange(newActiveItem => {
  console.log(newActiveItem)
})

activeItemIndex.set(1)
