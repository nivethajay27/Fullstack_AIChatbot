FullStack ChatBOT Documentation

Overview:
The FullStack ChatBOT is a web-based application that allows users to register, login, and interact with a chatbot in real-time. It provides a seamless user experience with a React-based frontend and an Express.js backend. (*Assuming it uses AWS services for hosting, scalability, and reliability*)

Features:
User registration and login (Token-based authentication for secure communication).

Real-time chatbot interaction.

Scalable architecture for handling varying traffic loads.

Prerequisites:
Node.js and npm installed on your machine.

PostgreSQL database installed and running locally.

Git installed for cloning the project repository.

(Add your own Anthropic API key since it does not let me upload my API key to Github)

Installation and Setup:
Here are the deployment instructions for running the FullStack ChatBOT application on localhost:

1. Clone the project repository from GitHub 

2. Run the Backend Server: 

    cd backend     
    npm run server

    This will start the Express.js server on port 8080 by default.

3. Run the Frontend React App:
    
     cd frontend
     npm start 

4. Database Setup:

    Create a PostgreSQL database named chatbot_db.
   
    Run the database migrations to create the necessary tables:
    npm run migrate
 Or :

Create new table using   CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL,
  tokens INT NOT NULL DEFAULT 1000)

6. Testing  

For Backend -   cd backend 
npm test

For frontend -   cd frontend/src
npm test
