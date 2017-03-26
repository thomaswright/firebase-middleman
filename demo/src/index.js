import React from 'react'
import {render} from 'react-dom'


let Demo = React.createClass({
  render() {
    return <div>
      <h1>firebase-middleman Demo</h1>
    </div>
  }
})

render(<Demo/>, document.querySelector('#demo'))
