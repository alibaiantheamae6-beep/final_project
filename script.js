let db;
const DB_NAME = "StudentDB";
const STORE_NAME = "students";
const DB_VERSION = 1;

// DOM elements
const form = document.getElementById("recordForm");
const saveBtn = document.getElementById("saveBtn");
const updateBtn = document.getElementById("updateBtn");
const tableBody = document.querySelector("#recordsTable tbody");
const recordIdInput = document.getElementById("recordId");
const searchInput = document.getElementById("search-input");
const messageBox = document.getElementById("message-box");

/**
 * IndexedDB Setup
 */
function initDB() {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only if the database is newly created or the version number is higher
    request.onupgradeneeded = function(event) {
        db = event.target.result;
        // Create the object store for students, using 'id' as the keyPath (auto-incrementing)
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        
        // Create indexes for efficient querying
        store.createIndex("studentId", "studentId", { unique: true }); // Crucial for unique ID validation
        store.createIndex("fullname", "fullname", { unique: false });
        store.createIndex("course", "course", { unique: false });
        store.createIndex("yearLevel", "yearLevel", { unique: false });
    };

    request.onsuccess = function(event) {
        db = event.target.result;
        console.log("IndexedDB successfully opened.");
        displayRecords();
    };

    request.onerror = function(event) {
        console.error("IndexedDB Error:", event.target.errorCode);
        showMessage("Database failed to open. Check console for details.", "error");
    };
}

/**
 * Message Handling (Replaces alert())
 * @param {string} message - The message to display.
 * @param {string} type - 'success' or 'error'.
 */
function showMessage(message, type = 'success') {
    messageBox.textContent = message;
    messageBox.className = ''; // Reset classes
    messageBox.classList.add('message-box', type === 'success' ? 'message-success' : 'message-error');
    messageBox.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
        messageBox.style.display = 'none';
    }, 5000);
}


/**
 * Form Submission Handler (Create or Update)
 */
form.onsubmit = async function(e) {
    e.preventDefault();

    const recordId = recordIdInput.value;
    const studentId = document.getElementById("studentId").value.trim();
    const fullname = document.getElementById("fullname").value.trim();
    const email = document.getElementById("email").value.trim();
    const course = document.getElementById("course").value;
    const yearLevel = document.getElementById("yearLevel").value;

    const record = { studentId, fullname, email, course, yearLevel };

    // Basic Validation: Check for empty fields
    for (const key in record) {
        if (!record[key]) {
            showMessage(`Please fill out the ${key} field.`, 'error');
            return;
        }
    }

    // Email format validation (simple regex)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showMessage("Please enter a valid email address.", 'error');
        return;
    }
    
    // Check Student ID uniqueness (only needed for creation or if ID is changed during update)
    if (recordId === "" || (recordId !== "" && recordIdInput.dataset.originalId !== studentId)) {
        const isUnique = await isStudentIdUnique(studentId, recordId ? parseInt(recordId) : null);
        if (!isUnique) {
            showMessage(`Student ID ${studentId} already exists.`, 'error');
            return;
        }
    }

    if (recordId) {
        // UPDATE operation
        record.id = parseInt(recordId);
        updateRecord(record);
    } else {
        // CREATE operation
        createRecord(record);
    }
};

/**
 * Checks if a student ID is unique in the database.
 * @param {string} studentId - The ID to check.
 * @param {number|null} excludeId - Optional ID of the record being edited (to exclude itself).
 * @returns {Promise<boolean>} - True if unique, false otherwise.
 */
function isStudentIdUnique(studentId, excludeId = null) {
    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_NAME], "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("studentId");
        
        const request = index.get(studentId);

        request.onsuccess = function(event) {
            const existingRecord = event.target.result;
            
            if (!existingRecord) {
                // ID does not exist, so it's unique
                resolve(true);
            } else if (existingRecord.id === excludeId) {
                // ID exists, but it belongs to the record we are currently editing
                resolve(true);
            } else {
                // ID exists and belongs to another record
                resolve(false);
            }
        };

        request.onerror = function() {
            console.error("Error checking unique ID.");
            resolve(false);
        }
    });
}

/**
 * CRUD: Create (Add new record)
 * @param {object} record - The student record data.
 */
function createRecord(record) {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const request = store.add(record);

    request.onsuccess = () => {
        showMessage("Student record added successfully!");
    };

    request.onerror = (event) => {
        // This usually catches a unique constraint violation if 'isStudentIdUnique' fails for some reason
        console.error("Error adding record:", event.target.error);
        showMessage("Failed to add record. Student ID might already exist.", 'error');
    };

    transaction.oncomplete = () => {
        resetForm();
        displayRecords();
    };
}

/**
 * CRUD: Read (Display all records or filtered records)
 * @param {string} filterText - Text to filter the records by.
 */
function displayRecords(filterText = '') {
    tableBody.innerHTML = "";
    const filter = filterText.toLowerCase();

    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);

    store.openCursor().onsuccess = function(event) {
        const cursor = event.target.result;
        if (cursor) {
            const data = cursor.value;

            // Filtering logic
            const matchesFilter = !filter || 
                                  data.fullname.toLowerCase().includes(filter) ||
                                  data.studentId.toLowerCase().includes(filter) ||
                                  data.course.toLowerCase().includes(filter);

            if (matchesFilter) {
                const row = document.createElement("tr");
                row.innerHTML = `
                    <td data-label="ID">${data.id}</td>
                    <td data-label="Student ID">${data.studentId}</td>
                    <td data-label="Full Name">${data.fullname}</td>
                    <td data-label="Email">${data.email}</td>
                    <td data-label="Course">${data.course}</td>
                    <td data-label="Year Level">${data.yearLevel}</td>
                    <td class="actions">
                        <button class="edit" onclick="prepareUpdateForm(${data.id})">Edit</button>
                        <button class="delete" onclick="confirmDelete(${data.id}, '${data.fullname}')">Delete</button>
                    </td>`;
                tableBody.appendChild(row);
            }
            cursor.continue();
        } else if (tableBody.childElementCount === 0 && filter) {
             // Show message if no records match the filter
             const row = document.createElement("tr");
             row.innerHTML = `<td colspan="7">No records found matching "${filterText}".</td>`;
             tableBody.appendChild(row);
        } else if (tableBody.childElementCount === 0) {
            // Show message if no records exist at all
            const row = document.createElement("tr");
            row.innerHTML = `<td colspan="7">No student records in the database.</td>`;
            tableBody.appendChild(row);
        }
    };
}

/**
 * CRUD: Update (Fills form for editing)
 * @param {number} id - The ID of the record to edit.
 */
window.prepareUpdateForm = function(id) {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = function() {
        const data = request.result;
        if (data) {
            // Populate form fields
            document.getElementById("studentId").value = data.studentId;
            document.getElementById("fullname").value = data.fullname;
            document.getElementById("email").value = data.email;
            document.getElementById("course").value = data.course;
            document.getElementById("yearLevel").value = data.yearLevel;
            
            // Set hidden ID for update logic
            recordIdInput.value = data.id;
            
            // Store original Student ID to check for changes during validation
            recordIdInput.dataset.originalId = data.studentId; 
            
            // Adjust button visibility/text
            saveBtn.style.display = 'none';
            updateBtn.style.display = 'block';
            document.getElementById("resetBtn").textContent = 'Cancel Edit';

            showMessage(`Editing record for ${data.fullname}.`, 'success');
        } else {
            showMessage("Record not found for editing.", 'error');
        }
    };
};

/**
 * CRUD: Update (Commits the update to IndexedDB)
 * @param {object} record - The updated student record object.
 */
function updateRecord(record) {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    // Put() updates an existing record if the keyPath (id) exists
    const request = store.put(record); 

    request.onsuccess = () => {
        showMessage(`Record for ${record.fullname} updated successfully!`, 'success');
    };

    request.onerror = (event) => {
        console.error("Error updating record:", event.target.error);
        showMessage("Failed to update record.", 'error');
    };

    transaction.oncomplete = () => {
        resetForm();
        displayRecords();
    };
}

/**
 * CRUD: Delete (Remove record)
 * @param {number} id - The ID of the record to delete.
 * @param {string} name - The name of the record (for confirmation message).
 */
window.confirmDelete = function(id, name) {
    // Simple confirmation dialog replacement
    if (window.confirm(`Are you sure you want to delete the record for ${name} (ID: ${id})?`)) {
        deleteRecord(id);
    }
}

function deleteRecord(id) {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.delete(id);

    request.onsuccess = () => {
        showMessage("Record deleted successfully!", 'success');
    };
    
    request.onerror = (event) => {
        console.error("Error deleting record:", event.target.error);
        showMessage("Failed to delete record.", 'error');
    };

    transaction.oncomplete = displayRecords;
}

/**
 * Utility: Reset form state
 */
function resetForm() {
    form.reset();
    recordIdInput.value = "";
    recordIdInput.dataset.originalId = "";
    saveBtn.style.display = 'block';
    updateBtn.style.display = 'none';
    document.getElementById("resetBtn").textContent = 'Reset';
    showMessage("Form reset.", 'success');
}

// Bind resetForm to the Reset button
document.getElementById("resetBtn").onclick = function(e) {
    e.preventDefault();
    resetForm();
}

/**
 * Search functionality
 */
searchInput.oninput = function() {
    // Debouncing is a good idea for performance, but for simplicity, we'll call displayRecords directly
    displayRecords(this.value);
};


// Initialize the database and load data when the script loads
initDB();