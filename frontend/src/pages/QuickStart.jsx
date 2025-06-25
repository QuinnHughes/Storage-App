import './QuickStart.css';

const QuickStart = () => (
  <div className="quickstart">
    <h1>Storage App Overview</h1>
    <p>
      This guide will give a brief overview of each function in this app, for a more detailed guide check out the Documentation page.
    </p>
    <section>
    <h2>First Things First</h2>
      <ul>
        <li><b>Login Page</b>: You will need to use this page before most things in this app will work for you, sometimes you may appear to be logged in but it is just your browser storing an expired key. If you keep getting repeat unathorized access errors when you should have access try disabling cookies for the site.</li>
     <br></br>
     <li><b>Permissions</b>: For this application there are four permissions levels Admin, Cataloger, Book Worm, and Viewers. Admin can do it all and unless you are the proverbial big dog don't bother asking for it. Cataloger permissions allows access to everything related to books along with the chefs choice of select cataloging tools. The Book Worms permission allows users to upload and search from general storage app functions but won't allow access to cataloging tools. Viewer is exactly what it sounds like you can look but you can't touch. </li>
      </ul>
    <h2>Searches</h2>
      <ul>
       <li><b>Empty Space</b>: Finds empty spaces in between min and max objects on a shelf, it will also predict where entirely empty shelves are based on related nearby shelves and label them "xxx" to indicate an empty shelf.</li>
     <br></br>
        <li><b>Item Search</b>: Used to locate items by either storage call number or barcode, here is where you will find the most accurate information as to whats on the shelf today. For the why refer to the Documentation.</li>
      <br></br>
        <li><b>Analytics Search</b>: The analytics search is used to search by information other than barcode and storage call number, and instead information such as title, location, and status. NOTICE information here is supplement to Item search information and it is highly recommended that you read the documentation to understand how this gets its results and why it is the way it is.</li>
      <br></br>
        <li><b>Weeded Items</b>: Coming Soon to a storage app near you.</li>
      </ul>

    <h2>Record Edits</h2>
      <ul>
        <li><b>Item Manager</b>: Allows for the manual edit of records across the Item and Analytics databases, good to use when you get a pesky record or only need to make a few changes to a few items. This will require account privileges. </li>
      <br></br>
        <li><b>Upload Items</b>: Used for mass record input and editing of the primary database, requires a specific format of excel sheet which a sample is available for download in documentation. NOTICE this is without a doubt the most dangerous feature when it comes to messing things up so be absolutely certain you fully understand what you are doing before using this. <b>The machine wll not forgive your mistakes here</b>.</li>
      <br></br>
        <li><b>Upload Analytics</b>:Works similar to upload items and allows you to upload exported results from oracle analytics to be combined with item uploads. NOTICE when using these be sure you have read the documentation about how this works .</li>
      </ul>

    </section>

  </div>
);

export default QuickStart;

