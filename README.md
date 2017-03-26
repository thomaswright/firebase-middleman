# firebase-middleman

Graph querying and structured mutation helpers

## Motivation

Firebase is great, but it's often difficult to manage your data, especially if you denormalize and duplicate as recommended for efficient queries. This library helps; it denormalizes all MANY attribute relations (for fast querying), automatically manages attribute changes across all record locations, and provides a convenient means for binding to data as specified in a graph query description.

Significantly reduced the size, complexity, and mental overhead of your firebase code.

## Install

```
npm install firebase-middleman
```

## Use

A relational-db-like schema is defined and used to produce 1. a mutation function set and 2. a graph querying component maker.

Examples are for a project to build a teacher's grade book, similar to http://gradebookplusplus.com (the project for which this library was originally developed).

### Schema

```js
// schema.js

// arrToObjEnums is just a little helper function
import { arrToObjEnums } from 'firebase-middleman'

const nodeTypes = arrToObjEnums([
  "User",
  "Course",
  "Assignment",
  "Student",
  "Grade",
  "Category",
  "Tag"
]);

/*
const schemaSignature = {
  [scalarAttribute]: true,
  [relationAttribute]: [
    relationNodeType,
    relationOrder,
    shouldDeleteOnRelationDeletion,
    reciprocalRelationAttribute
  ],
  ...
}
*/

const ONE = 'ONE'
const MANY = 'MANY'

const schema = {
  [nodeTypes.User]: {
    id: true,
    name: true,
    displayName: true,
    email: true,
    courses: [nodeTypes.Course, MANY, true, 'user']
  },
  [nodeTypes.Course]: {
    id: true,
    name: true,
    user: [nodeTypes.User, ONE, false, 'courses'],
    assignments: [nodeTypes.Assignment, MANY, true, 'course'],
    categories: [nodeTypes.Category, MANY, true, 'course'],
  },
  [nodeTypes.Assignment]: {
    id: true,
    name: true,
    dueDate: true,
    points: true,
    course: [nodeTypes.Course, ONE, false, 'assignments'],
    tags: [nodeTypes.Tag, MANY, false, 'assignments'],
    grades: [nodeTypes.Grade, MANY, true, 'assignment']
  },
  [nodeTypes.Category]: {
    id: true,
    name: true,
    course: [nodeTypes.Course, ONE, false, 'categories'],
    tags: [nodeTypes.Tag, MANY, true, 'category']
  },
  [nodeTypes.Tag]: {
    id: true,
    name: true,
    category: [nodeTypes.Category, ONE, false, 'tags'],
    assignments: [nodeTypes.Assignment, MANY, false, 'tags'],
  },
  ...
}

export default schema

```

### Mutation function set

Other than the schema we'll also need a firebase reference.

```js
// firebaseRootRef.js
import firebase from 'firebase'
import config from './firebaseConfig'

const firebaseApp = firebase.initializeApp(config);
const firebaseDB = firebaseApp.database()
const rootRef = firebaseDB.ref()

export default rootRef
```

With those two elements, we can create our mutator.

```js
// mutator.js
import { makeMutator } from 'firebase-middleman'
import schema from './schema'
import rootRef from './firebaseRootRef'

const mutator = makeMutator(schema, rootRef, false)
// third parameter is a logging switch

export default mutator
```

This mutator object has six primary methods (defined below): updateNode(s), createNode(s), and deleteNode(s).

```js
// someComponent.js

import mutator from './mutator'

// in some component action handler ...

mutator.updateNode({
  nodeType,
  nodeId,
  setScalars: {
    [scalarAttribute]: scalarValue,
    [anotherScalarAttribute]: anotherScalarValue,
    ...
  },
  setEdges: {
    [ONEedgeAttribute]: nodeId1,
    [MANYedgeAttribute]: [nodeId2, nodeId3, ...],
    // setEdges replaces whatever value currently exists
  },
  addEdges: {
    // can only specify MANY edge attributes (as in setEdges)
    // addEdges will add to the edge attr the specified relation ids
  },
  deleteEdges: {
    // can only specify MANY edge attributes (as in setEdges)
    // deleteEdges will delete from the edge attr the specified relation ids
  },
})
// Note: don't use addEdges and setEdges or deleteEdges and setEdges for the same attribute. setEdges will override, but using with the same action attr is potentially confusing.


mutator.createNode({
  nodeType,
  setScalars,
  setEdges
})

mutator.deleteNode({
  nodeType,
  nodeId
})

mutator.createNodes([...argObjectsAsAbove])
mutator.deleteNodes([...argObjectsAsAbove])
mutator.updateNode([...argObjectsAsAbove])

```

There's also included nodeType named mutation methods for convenience (no need to specify nodeType then). Pluralization is not smart; just add an s.


```js
// someComponent.js continued

// in some component action handler ...
mutator.createUser({...})
mutator.updateCourses([{...},{...},...])
mutator.deleteCategorys([...])

```


### Graph query component maker

Given that your firebase db is developed with the firebase-middleman mutation set (above), you can use the firebase-middleman makeQueryCompMaker. Components made with this function take a node id prop and navigate your firebase database to bind to and inject data as specified in your query. Any changes made to the database (by one client or another) are updated and sent to the component in real time, regardless of the query depth. The firebase-middleman mutation set duplicates node data for all MANY attributes one level deep, so shallow queries are fast. As you increase the levels you may notice an increase in the time it takes to initially bind the query tree.

Given our schema and rootRef we can create our queryCompMaker.

```js
// queryCompMaker.js
import { makeQueryCompMaker } from 'firebase-middleman'
import rootRef from './firebaseRootRef'
import schema from './schema'

const queryCompMaker = makeQueryCompMaker(schema, rootRef)

export default queryCompMaker

```

Then use it.

```js
// CoursePage.js
import queryCompMaker from './queryCompMaker'
import CourseView from './CourseView'

const exampleDeepQuery = {
  id: true,
  name: true,
  categories: {
    id: true,
    name: true,
    tags: {
      id: true,
      name: true,
      assignments: {
        id: true,
        name: true,
        course: {
          id: true,
          name: true
        }
      },
    }
  }
}

const courseQuery = {
  id: true,
  name: true,
  students: {
    id: true,
    name: true
  },
  assignments: {
    id: true,
    name: true,
    dueDate: true,
    tags: true,
    points: true,
  },
  categories: {
    id: true,
    name: true,
    tags: {
      id: true,
      name: true,
    }
  }
}

const CourseQueryComp = queryCompMaker({
  ComposedComponent: CourseView,
  queryOnType: 'Course', // or, say, nodeTypes.Course
  query: courseQuery
});

const CourseComp = props => <CourseQueryComp queryOnNode={props.courseId} {...props} />;

const InUse = (someProps) => {
  return <div>
    <CourseComp courseId={...} />
  <div>
}

```

## Contributions

Feel free to send PRs and add issues re whatever.

## Prospective Roadmap

- add prop checks
- extract react dependency
- extract firebase dependency
- provide demo
- integrate rule development
- eventually typescript this thing




<!--
[![Travis][build-badge]][build]
[![npm package][npm-badge]][npm]
[![Coveralls][coveralls-badge]][coveralls]

[build-badge]: https://img.shields.io/travis/user/repo/master.png?style=flat-square
[build]: https://travis-ci.org/user/repo

[npm-badge]: https://img.shields.io/npm/v/npm-package.png?style=flat-square
[npm]: https://www.npmjs.org/package/npm-package

[coveralls-badge]: https://img.shields.io/coveralls/user/repo/master.png?style=flat-square
[coveralls]: https://coveralls.io/github/user/repo -->
