import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters, StorageSharedKeyCredential } from "@azure/storage-blob";
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { fileName, fileType } = await request.json();

    if (!fileName || !fileType) {
      return NextResponse.json({ error: 'Missing fileName or fileType' }, { status: 400 });
    }

    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME;

    if (!connectionString || !containerName) {
      console.error("Azure Storage Connection String or Container Name not configured.");
      return NextResponse.json({ error: 'Azure Storage configuration incomplete.' }, { status: 500 });
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    // Ensure container exists
    try {
      await containerClient.createIfNotExists(); // Default access is private
    } catch (error) {
      console.error("Failed to create or access container", error);
      return NextResponse.json({ error: 'Failed to access storage container.' }, { status: 500 });
    }
    
    // Sanitize fileName to ensure it's a valid blob name component
    // Replace characters not allowed in blob names (e.g., spaces, special chars other than -, ., /)
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9_\.\-\/]/g, '_');
    const blobName = `${Date.now()}-${sanitizedFileName}`;

    const blobClient = containerClient.getBlockBlobClient(blobName);

    // Extract account name and key for SAS generation if using fromConnectionString
    // This is a bit roundabout. Ideally, the SDK would make this smoother.
    // Alternatively, construct BlobServiceClient with StorageSharedKeyCredential if account name/key are separate env vars.
    let accountKey: string | undefined;
    let accountName: string | undefined;

    const connStringParts = connectionString.split(';').reduce((acc, part) => {
        const [key, value] = part.split('=');
        acc[key] = value;
        return acc;
    }, {} as Record<string, string>);

    accountName = connStringParts.AccountName;
    accountKey = connStringParts.AccountKey;

    if (!accountName || !accountKey) {
        console.error("Could not parse AccountName or AccountKey from connection string for SAS generation.");
        return NextResponse.json({ error: 'Failed to parse storage credentials for SAS.' }, { status: 500 });
    }
    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const sasOptions = {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse("racw"), // read, add, create, write 
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour to upload
      contentType: fileType, 
    };

    const sasToken = generateBlobSASQueryParameters(sasOptions, sharedKeyCredential).toString();
    const uploadUrl = `${blobClient.url}?${sasToken}`;
    const blobAccessUrl = blobClient.url; // This is the direct URL to the blob for later use (GET requests)

    return NextResponse.json({ uploadUrl, blobName, blobAccessUrl });

  } catch (error: any) {
    console.error("Error generating SAS URL:", error);
    return NextResponse.json({ error: error.message || 'Failed to generate SAS URL' }, { status: 500 });
  }
} 